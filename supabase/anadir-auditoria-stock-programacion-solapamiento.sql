-- Revisión de paneles internos pedida por Diego (19/10/2026): varias
-- mejoras independientes agrupadas en una sola migración porque todas
-- son aditivas (no tocan ni borran nada existente).

-- 1. Auditoría de acciones de admin: quién canceló/movió/completó una
-- cita (y, en general, cualquier acción sensible que se vaya
-- instrumentando con registrarAuditoria() en lib/auditoria.ts). De solo
-- lectura desde el panel — nadie puede editar ni borrar una fila de
-- aquí, ni siquiera un admin, para que sea un registro de fiar.
create table auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id) on delete set null,
  admin_nombre text not null,
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  detalle jsonb,
  created_at timestamptz not null default now()
);
create index auditoria_admin_entidad_idx on auditoria_admin(entidad, entidad_id);
create index auditoria_admin_created_at_idx on auditoria_admin(created_at desc);

alter table auditoria_admin enable row level security;
create policy "auditoria_admin_admin_read" on auditoria_admin for select using (is_admin());
-- A propósito NO hay política de insert/update/delete para usuarios
-- autenticados por RLS: solo el backend (service role, que siempre pasa
-- por encima de RLS) escribe aquí, nunca directamente un admin desde el
-- panel.

-- 2. Stock de productos (opcional por producto): NULL = no se controla
-- stock de este producto (comportamiento igual que hasta ahora). Con un
-- número puesto, se descuenta solo al cerrar una cita con ese producto
-- (ver app/api/admin/citas/[id]/finalizar/route.ts) y el panel avisa
-- cuando llega al mínimo.
alter table productos
  add column if not exists stock integer,
  add column if not exists stock_minimo integer not null default 3;

-- 3. Campañas programadas: si programada_para tiene fecha, la campaña
-- se manda sola a esa hora (ver /api/cron/campanas-programadas) en vez
-- de solo poder mandarse al instante desde el panel.
alter table campanas
  add column if not exists programada_para timestamptz;

-- 4. Protege contra el doble-booking A NIVEL DE BASE DE DATOS, no solo
-- en el código de la aplicación: dos citas activas (no canceladas) del
-- MISMO profesional no pueden solaparse en el tiempo. Hasta ahora esto
-- solo lo comprobaba el propio código (comprobarHuecoLibre) antes de
-- insertar — en el caso muy raro de dos reservas a la vez (p.ej. la web
-- y el bot de WhatsApp en el mismo segundo), en teoría podían colarse
-- las dos. Esta restricción lo hace imposible pase lo que pase, sin
-- cambiar ningún comportamiento normal (ya se comprobó que hoy no hay
-- ninguna cita existente que la viole).
create extension if not exists btree_gist;

alter table citas add constraint citas_sin_solapamiento
  exclude using gist (
    profesional_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado <> 'cancelada' and profesional_id is not null);
