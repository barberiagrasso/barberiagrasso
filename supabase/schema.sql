-- =====================================================================
-- Barbería Grasso — Esquema de base de datos (Supabase / PostgreSQL)
-- =====================================================================
-- Cómo usar este archivo: Supabase Dashboard → SQL Editor → pegar todo
-- el contenido → Run. Ver también seed.sql para datos de ejemplo.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- SEDES
-- ---------------------------------------------------------------------
create table sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique not null,
  direccion text,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SERVICIOS (catálogo global; puede sobreescribirse por sede en sede_servicios)
-- ---------------------------------------------------------------------
create table servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  duracion_minutos int not null check (duracion_minutos > 0),
  precio_centimos int not null check (precio_centimos >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table sede_servicios (
  sede_id uuid not null references sedes(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete cascade,
  precio_centimos int,
  duracion_minutos int,
  activo boolean not null default true,
  primary key (sede_id, servicio_id)
);

-- ---------------------------------------------------------------------
-- PROFESIONALES
-- ---------------------------------------------------------------------
create table profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table profesional_sedes (
  profesional_id uuid not null references profesionales(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  primary key (profesional_id, sede_id)
);

create table profesional_servicios (
  profesional_id uuid not null references profesionales(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete cascade,
  primary key (profesional_id, servicio_id)
);

-- Turnos recurrentes semanales (0 = domingo ... 6 = sábado)
create table horarios (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  check (hora_fin > hora_inicio)
);

-- Vacaciones, festivos o ausencias puntuales
create table bloqueos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid references profesionales(id) on delete cascade, -- null = afecta a toda la sede
  sede_id uuid not null references sedes(id) on delete cascade,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  motivo text,
  check (fecha_fin > fecha_inicio)
);

-- ---------------------------------------------------------------------
-- CLIENTES Y CRM
-- ---------------------------------------------------------------------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null unique,
  email text,
  sede_habitual_id uuid references sedes(id),
  etiquetas text[] default '{}',
  notas text,
  created_at timestamptz not null default now()
);

create table consentimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('operativo', 'comercial')),
  canal text not null check (canal in ('app', 'whatsapp', 'panel')),
  texto_aceptado text not null,
  estado text not null default 'activo' check (estado in ('activo', 'revocado')),
  created_at timestamptz not null default now(),
  revocado_at timestamptz
);

-- ---------------------------------------------------------------------
-- CITAS
-- ---------------------------------------------------------------------
create table citas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  profesional_id uuid references profesionales(id),
  servicio_id uuid not null references servicios(id),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null default 'confirmada'
    check (estado in ('confirmada', 'cancelada', 'completada', 'no_presentada')),
  origen text not null default 'app' check (origen in ('app', 'panel', 'whatsapp')),
  notas text,
  created_at timestamptz not null default now(),
  check (fin > inicio)
);

create index citas_sede_inicio_idx on citas (sede_id, inicio);
create index citas_profesional_inicio_idx on citas (profesional_id, inicio);
create index citas_cliente_idx on citas (cliente_id);

-- ---------------------------------------------------------------------
-- WHATSAPP: CONVERSACIONES Y MENSAJES
-- ---------------------------------------------------------------------
create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  telefono text not null,
  estado text not null default 'ia' check (estado in ('ia', 'escalada', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversaciones_telefono_idx on conversaciones (telefono);

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  remitente text not null check (remitente in ('cliente', 'ia', 'gestor')),
  contenido text not null,
  created_at timestamptz not null default now()
);

create index mensajes_conversacion_idx on mensajes (conversacion_id, created_at);

-- ---------------------------------------------------------------------
-- CAMPAÑAS COMERCIALES
-- ---------------------------------------------------------------------
create table campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  canal text not null check (canal in ('whatsapp', 'email', 'push')),
  mensaje text not null,
  segmento jsonb,
  enviada_at timestamptz,
  created_at timestamptz not null default now()
);

create table campana_destinatarios (
  campana_id uuid not null references campanas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido')),
  primary key (campana_id, cliente_id)
);

-- ---------------------------------------------------------------------
-- ADMINISTRADORES DEL PANEL
-- ---------------------------------------------------------------------
-- Se rellena manualmente tras crear tu usuario en Supabase Auth (ver README).
create table admins (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================================
-- Principio: el catálogo (sedes/servicios/profesionales/horarios) es de
-- lectura pública porque la página de reserva lo necesita sin login.
-- Todo lo que sea dato personal de clientes (citas, clientes,
-- consentimientos, conversaciones, campañas) NO es accesible con la
-- clave pública (anon key): sólo el backend (service role, usado en las
-- rutas /api/... del servidor) o un administrador autenticado pueden
-- leerlo o escribirlo.

alter table sedes enable row level security;
alter table servicios enable row level security;
alter table sede_servicios enable row level security;
alter table profesionales enable row level security;
alter table profesional_sedes enable row level security;
alter table profesional_servicios enable row level security;
alter table horarios enable row level security;
alter table bloqueos enable row level security;
alter table clientes enable row level security;
alter table consentimientos enable row level security;
alter table citas enable row level security;
alter table conversaciones enable row level security;
alter table mensajes enable row level security;
alter table campanas enable row level security;
alter table campana_destinatarios enable row level security;
alter table admins enable row level security;

-- Función auxiliar: ¿el usuario autenticado actual es admin?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where id = auth.uid());
$$;

-- Catálogo: lectura pública de filas activas, escritura sólo admins
create policy "sedes_public_read" on sedes for select using (activo = true);
create policy "sedes_admin_write" on sedes for all using (is_admin()) with check (is_admin());

create policy "servicios_public_read" on servicios for select using (activo = true);
create policy "servicios_admin_write" on servicios for all using (is_admin()) with check (is_admin());

create policy "sede_servicios_public_read" on sede_servicios for select using (activo = true);
create policy "sede_servicios_admin_write" on sede_servicios for all using (is_admin()) with check (is_admin());

create policy "profesionales_public_read" on profesionales for select using (activo = true);
create policy "profesionales_admin_write" on profesionales for all using (is_admin()) with check (is_admin());

create policy "profesional_sedes_public_read" on profesional_sedes for select using (true);
create policy "profesional_sedes_admin_write" on profesional_sedes for all using (is_admin()) with check (is_admin());

create policy "profesional_servicios_public_read" on profesional_servicios for select using (true);
create policy "profesional_servicios_admin_write" on profesional_servicios for all using (is_admin()) with check (is_admin());

create policy "horarios_public_read" on horarios for select using (true);
create policy "horarios_admin_write" on horarios for all using (is_admin()) with check (is_admin());

create policy "bloqueos_public_read" on bloqueos for select using (true);
create policy "bloqueos_admin_write" on bloqueos for all using (is_admin()) with check (is_admin());

-- Datos personales / operativos: sólo admins (el backend usa la service
-- role key, que siempre pasa por encima de RLS, para las operaciones que
-- hacen los propios clientes: reservar, hablar por WhatsApp, etc.)
create policy "clientes_admin_all" on clientes for all using (is_admin()) with check (is_admin());
create policy "consentimientos_admin_all" on consentimientos for all using (is_admin()) with check (is_admin());
create policy "citas_admin_all" on citas for all using (is_admin()) with check (is_admin());
create policy "conversaciones_admin_all" on conversaciones for all using (is_admin()) with check (is_admin());
create policy "mensajes_admin_all" on mensajes for all using (is_admin()) with check (is_admin());
create policy "campanas_admin_all" on campanas for all using (is_admin()) with check (is_admin());
create policy "campana_destinatarios_admin_all" on campana_destinatarios for all using (is_admin()) with check (is_admin());

create policy "admins_self_read" on admins for select using (auth.uid() = id);
