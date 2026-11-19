-- Panel de personal (pedido de David, 19/11/2026): sueldo base y meta
-- mensual de cada barbero, con sus notas. Las comisiones salen de
-- Comisiones y las valoraciones de Opiniones; esta tabla solo añade lo
-- que faltaba para la reunión de pago.
--
-- Se puede ejecutar más de una vez sin romper nada.

create table if not exists personal_config (
  profesional_id uuid primary key references profesionales(id) on delete cascade,
  sueldo_base_centimos integer not null default 0 check (sueldo_base_centimos >= 0),
  meta_mensual_centimos integer not null default 400000 check (meta_mensual_centimos >= 0),
  notas text,
  updated_at timestamptz not null default now()
);

-- Solo el servidor (service role) lee y escribe: nada con la clave pública.
alter table personal_config enable row level security;
