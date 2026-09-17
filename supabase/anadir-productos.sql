-- =====================================================================
-- Productos en tienda + comisión de productos
-- =====================================================================
-- Ejecutar una sola vez en Supabase Dashboard → SQL Editor (ya aplicada
-- en producción). Añade:
--
-- 1. productos: catálogo de productos que SOLO se venden en persona (no
--    se pueden ver ni comprar desde la reserva online) — el barbero los
--    añade a una cita al marcarla como completada.
-- 2. cita_productos: los productos añadidos a cada cita, con una "foto"
--    del precio en el momento de añadirlos (igual que cita_extras con
--    los servicios complemento), para que un cambio de precio futuro no
--    altere el histórico.
-- 3. comisiones_config_productos: el porcentaje plano de comisión sobre
--    la venta de productos (decisión de Diego, 12/09/2026): a diferencia
--    de la comisión por servicios, la de productos NO tiene tramos —
--    es un único porcentaje sobre el total vendido, desde el primer
--    euro. Tabla de una sola fila (singleton), editable solo por el rol
--    "admin" desde el panel de Comisiones.
-- =====================================================================

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Agrupa el catálogo en el selector del panel (Cuidado y tratamiento
  -- capilar, Ceras y fijación...) — solo es organización visual, no
  -- afecta al cálculo de nada.
  categoria text,
  precio_centimos int not null check (precio_centimos >= 0),
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Productos añadidos a una cita ya cerrada. cantidad > 1 para cuando el
-- cliente compra más de una unidad del mismo producto en la misma
-- visita. precio_centimos es el precio UNITARIO en el momento de
-- añadirlo (foto, igual que en cita_extras).
create table cita_productos (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references citas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad int not null default 1 check (cantidad > 0),
  precio_centimos int not null check (precio_centimos >= 0),
  created_at timestamptz not null default now()
);

create index cita_productos_cita_idx on cita_productos (cita_id);

-- Singleton (id siempre true: solo puede existir una fila) — el
-- porcentaje plano de comisión sobre ventas de productos.
create table comisiones_config_productos (
  id boolean primary key default true check (id),
  porcentaje numeric(5,2) not null default 15.00 check (porcentaje >= 0 and porcentaje <= 100),
  updated_at timestamptz not null default now()
);

insert into comisiones_config_productos (id, porcentaje) values (true, 15.00);

alter table productos enable row level security;
alter table cita_productos enable row level security;
alter table comisiones_config_productos enable row level security;

create policy "productos_admin_all" on productos for all using (is_admin()) with check (is_admin());
create policy "cita_productos_admin_all" on cita_productos for all using (is_admin()) with check (is_admin());
create policy "comisiones_config_productos_admin_all" on comisiones_config_productos for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- Catálogo inicial: "GRASSO — Productos y precios, Las Ciudades 90,
-- Getafe" (hoja enviada por Diego, 17/09/2026). Un único catálogo
-- compartido por las dos sedes por ahora (se puede restringir por sede
-- más adelante si hace falta, como ya pasa con los servicios).
-- ---------------------------------------------------------------------
insert into productos (nombre, categoria, precio_centimos, orden) values
  -- Cuidado y tratamiento capilar
  ('Shampoo Multiefecto Jaldun', 'Cuidado y tratamiento capilar', 3450, 1),
  ('Tónico equilibrante Jaldun', 'Cuidado y tratamiento capilar', 3900, 2),
  ('Tónico Actanagen', 'Cuidado y tratamiento capilar', 5960, 3),
  ('Shampoo crecimiento Rapunzel', 'Cuidado y tratamiento capilar', 1354, 4),
  ('Minoxidil crecimiento', 'Cuidado y tratamiento capilar', 1765, 5),
  ('Protector térmico', 'Cuidado y tratamiento capilar', 1490, 6),
  ('Bifásico', 'Cuidado y tratamiento capilar', 1480, 7),
  ('Laca', 'Cuidado y tratamiento capilar', 1289, 8),
  -- Cabello rizado
  ('Espuma rizos', 'Cabello rizado', 1470, 1),
  ('Mascarilla rizos', 'Cabello rizado', 1410, 2),
  ('Shampoo cabellos rizados', 'Cabello rizado', 1366, 3),
  ('Crema activadora de peinado rizos', 'Cabello rizado', 1377, 4),
  -- Canas y matización
  ('Sobre de canas', 'Canas y matización', 720, 1),
  ('Shampoo para canas', 'Canas y matización', 2975, 2),
  ('Shampoo matizador', 'Canas y matización', 1365, 3),
  -- Ceras y fijación
  ('Cera One Millon', 'Ceras y fijación', 1280, 1),
  ('Cera 1 marrón', 'Ceras y fijación', 1280, 2),
  ('Cera 3 azul', 'Ceras y fijación', 1280, 3),
  ('Cera 4 verde', 'Ceras y fijación', 1280, 4),
  ('Cera 5 beige', 'Ceras y fijación', 1280, 5),
  ('Cera 6 gris', 'Ceras y fijación', 1280, 6),
  ('Cera 7 morada', 'Ceras y fijación', 1280, 7),
  ('Cera 8 amarilla', 'Ceras y fijación', 1280, 8),
  ('Spray sal marina', 'Ceras y fijación', 1280, 9),
  -- Polvos de peinado
  ('Polvo efecto volumen', 'Polvos de peinado', 1280, 1),
  ('Polvo rojo', 'Polvos de peinado', 1280, 2),
  ('Polvo verde', 'Polvos de peinado', 1280, 3),
  ('Polvo azul', 'Polvos de peinado', 1280, 4),
  ('Polvo matte', 'Polvos de peinado', 1280, 5),
  -- Barba y afeitado
  ('Peine pequeño barba GRASSO', 'Barba y afeitado', 566, 1),
  ('Bálsamo After básico', 'Barba y afeitado', 1270, 2),
  ('Loción After Shave', 'Barba y afeitado', 1295, 3),
  ('Beard Oil - aceite de barba', 'Barba y afeitado', 1388, 4),
  ('Navaja', 'Barba y afeitado', 1246, 5),
  -- Prótesis y fibra capilar
  ('Pegamento prótesis 100 ml', 'Prótesis y fibra capilar', 3300, 1),
  ('Pegamento prótesis 15 ml', 'Prótesis y fibra capilar', 1682, 2),
  ('Pack removedor + pegamento prótesis', 'Prótesis y fibra capilar', 3394, 3),
  ('Fibra capilar', 'Prótesis y fibra capilar', 1785, 4),
  -- Accesorios
  ('Esponja pequeña', 'Accesorios', 938, 1);
