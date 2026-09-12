-- =====================================================================
-- Barbería Grasso — Funcionalidad avanzada (2ª ronda):
-- CRM/campañas, plantillas de WhatsApp, recordatorios, complementos
-- estructurados para informes.
-- =====================================================================
-- Ejecuta esto en el SQL Editor de Supabase (New query → pegar → Run).
-- Es seguro volver a ejecutarlo (usa "if not exists" en todo), y no toca
-- ningún dato que ya tengas: solo añade tablas y columnas nuevas.
-- =====================================================================

begin;

-- 1. Recordatorios: marca de cuándo se mandó el recordatorio de cada
-- cita, para no mandarlo dos veces.
alter table citas add column if not exists recordatorio_enviado_at timestamptz;

-- 2. Complementos como filas propias (antes solo se guardaban como texto
-- en "notas"). Esto permite que los informes de facturación y de
-- servicios más pedidos los cuenten con precisión. Las citas antiguas no
-- se tocan: sencillamente no tendrán filas aquí, pero su texto en notas
-- se conserva tal cual.
create table if not exists cita_extras (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references citas(id) on delete cascade,
  servicio_id uuid not null references servicios(id),
  precio_centimos int not null,
  duracion_minutos int not null
);
create index if not exists cita_extras_cita_idx on cita_extras (cita_id);
alter table cita_extras enable row level security;
drop policy if exists "cita_extras_admin_all" on cita_extras;
create policy "cita_extras_admin_all" on cita_extras for all using (is_admin()) with check (is_admin());

-- 3. Plantillas de WhatsApp aprobadas por Meta (hacen falta para mandar
-- recordatorios y campañas, que son mensajes iniciados por el negocio
-- fuera de la ventana de 24h). De momento esta tabla estará vacía: la
-- rellenas tú desde el panel (/admin/plantillas) en cuanto Meta te
-- apruebe una plantilla.
create table if not exists plantillas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('recordatorio', 'campana')),
  nombre text not null,
  nombre_meta text not null,
  idioma text not null default 'es',
  variables text[] not null default '{}',
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
alter table plantillas_whatsapp enable row level security;
drop policy if exists "plantillas_whatsapp_admin_all" on plantillas_whatsapp;
create policy "plantillas_whatsapp_admin_all" on plantillas_whatsapp for all using (is_admin()) with check (is_admin());

-- 4. Campañas: añade el vínculo a la plantilla usada y un estado.
alter table campanas add column if not exists plantilla_id uuid references plantillas_whatsapp(id);
alter table campanas add column if not exists estado text not null default 'borrador';
do $$ begin
  alter table campanas add constraint campanas_estado_check check (estado in ('borrador', 'enviando', 'enviada', 'fallida'));
exception when duplicate_object then null;
end $$;

alter table campana_destinatarios add column if not exists enviado_at timestamptz;
alter table campana_destinatarios add column if not exists error text;

commit;
