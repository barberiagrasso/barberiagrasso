-- Recuperación de contraseña por WhatsApp + aviso de alta.
--
-- Como el identificador de Supabase Auth es un email "sintético" a
-- partir del teléfono (ver emailSinteticoParaTelefono en lib/clientes.ts)
-- que nunca se lee, el flujo de recuperación de contraseña por email de
-- Supabase no sirve aquí: hay que mandar el código por WhatsApp, al
-- mismo teléfono que ya es el identificador real del cliente en toda la
-- app. Reejecutable sin errores.

-- 1. Dos tipos de plantilla nuevos, para los dos avisos que el negocio
-- inicia SIN que el cliente haya escrito antes por WhatsApp (por eso
-- hacen falta plantillas aprobadas por Meta, igual que recordatorios y
-- campañas — ver README, sección "Recordatorios y campañas").
alter table plantillas_whatsapp drop constraint if exists plantillas_whatsapp_tipo_check;
alter table plantillas_whatsapp add constraint plantillas_whatsapp_tipo_check
  check (tipo in ('recordatorio', 'campana', 'retencion_inactivo', 'retencion_cumple', 'recuperacion_password', 'bienvenida'));

-- 2. Códigos de recuperación de contraseña: de un solo uso, caducan a
-- los 10 minutos, y se guarda el HASH del código (nunca el código en
-- claro) por si alguien llegara a leer la tabla. No se incluye en la
-- copia de seguridad diaria (ver app/api/cron/backup/route.ts) por el
-- mismo motivo que `intentos_seguridad`: es un rastro técnico y
-- temporal, sin ningún valor que conservar pasados los 10 minutos.
create table if not exists codigos_recuperacion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  codigo_hash text not null,
  intentos int not null default 0,
  expira_at timestamptz not null,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists codigos_recuperacion_cliente_idx on codigos_recuperacion(cliente_id, created_at desc);

alter table codigos_recuperacion enable row level security;
-- Solo la usa el servidor (con la clave de servicio, que salta la RLS);
-- esta política es solo para que, si algún día se tocara con la clave
-- pública por error, no se filtre ni se pueda escribir nada.
drop policy if exists "codigos_recuperacion_admin_all" on codigos_recuperacion;
create policy "codigos_recuperacion_admin_all" on codigos_recuperacion for all using (is_admin()) with check (is_admin());
