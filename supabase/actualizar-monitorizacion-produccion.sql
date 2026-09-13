-- Producción: registro de errores del sistema.
--
-- Guarda aquí cualquier fallo relevante que ocurra en el servidor
-- (crear una reserva, cancelarla, procesar un mensaje de WhatsApp, un
-- disparador programado que falla...) para que se pueda ver desde
-- /admin/errores sin depender de los logs de Vercel, que Diego no
-- consulta normalmente. Complementa a `fallos_asistente`, que ya
-- existía y sigue usándose solo para fallos del asistente de IA
-- respondiendo por WhatsApp.
--
-- Re-ejecutable: puedes pegar este archivo en el SQL Editor de Supabase
-- las veces que haga falta sin que rompa nada si ya lo tienes aplicado.
create table if not exists errores_sistema (
  id uuid primary key default gen_random_uuid(),
  origen text not null,
  mensaje text not null,
  detalle text,
  resuelto boolean not null default false,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);

alter table errores_sistema enable row level security;

create index if not exists errores_sistema_sin_resolver_idx
  on errores_sistema (created_at desc)
  where resuelto = false;

comment on table errores_sistema is
  'Errores de producción registrados por la propia app (reservas, cancelaciones, webhook de WhatsApp, tareas programadas). Solo se usa desde el servidor (con la service role), por eso no tiene políticas de RLS propias, igual que retencion_envios y campanas.';
