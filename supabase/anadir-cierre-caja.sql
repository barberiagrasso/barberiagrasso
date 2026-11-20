-- Apertura y cierre de caja diario por sede.
--
-- 1. caja_dias: una fila por sede y día. Se crea al ABRIR la caja (con el
--    fondo contado) y se completa al CERRARLA (cobros del día por método,
--    efectivo contado, diferencia y su motivo, fondo que se deja para
--    mañana y foto del sobre). Queda firmado con quién y cuándo.
-- 2. sedes.encargado_caja_admin_id: la única cuenta (además del dueño)
--    que puede cerrar la caja de esa sede. Abrir la puede cualquiera del
--    equipo de la sede.
-- 3. Bucket privado "caja" para las fotos del sobre (solo se ven desde
--    el panel, con enlaces temporales).
--
-- Se puede ejecutar más de una vez sin romper nada.

alter table sedes add column if not exists encargado_caja_admin_id uuid references admins(id) on delete set null;

create table if not exists caja_dias (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id) on delete cascade,
  fecha date not null,
  abierta_at timestamptz,
  abierta_por uuid references admins(id) on delete set null,
  abierta_por_nombre text,
  fondo_inicial_centimos integer check (fondo_inicial_centimos >= 0),
  cerrada_at timestamptz,
  cerrada_por uuid references admins(id) on delete set null,
  cerrada_por_nombre text,
  efectivo_cobrado_centimos integer,
  tarjeta_centimos integer,
  bizum_centimos integer,
  otros_centimos integer,
  num_cobros integer,
  efectivo_esperado_centimos integer,
  efectivo_contado_centimos integer,
  diferencia_centimos integer,
  motivo_diferencia text,
  fondo_siguiente_centimos integer check (fondo_siguiente_centimos >= 0),
  foto_ruta text,
  notas text,
  created_at timestamptz not null default now(),
  unique (sede_id, fecha)
);

create index if not exists caja_dias_sede_fecha on caja_dias (sede_id, fecha desc);

-- Solo el servidor (service role) lee y escribe: nada con la clave pública.
alter table caja_dias enable row level security;

insert into storage.buckets (id, name, public)
values ('caja', 'caja', false)
on conflict (id) do nothing;
