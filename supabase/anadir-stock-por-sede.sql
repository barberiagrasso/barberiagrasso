-- Stock de productos POR SEDE, con encargado y lista de pedido
-- (pedido de David, 10/11/2026).
--
-- 1. producto_stock_sede: cuántas unidades hay de cada producto en cada
--    sede, con su mínimo (por debajo, hay que pedir) y su cantidad ideal
--    (hasta dónde se pide). A pedir = ideal − stock cuando stock ≤ mínimo.
-- 2. stock_movimientos: historial de todo lo que cambia el stock (ventas
--    en el cobro, entradas de pedido, recuentos y ajustes), con quién lo
--    hizo. Así el encargado responde de cada número.
-- 3. sedes.encargado_stock_admin_id: el barbero (cuenta del panel)
--    responsable del stock de esa sede.
-- 4. registrar_movimiento_stock(): cambia el stock de forma atómica (con
--    bloqueo de fila) y deja el movimiento apuntado.
--
-- Se puede ejecutar más de una vez sin romper nada. Los stocks empiezan
-- en 0: el encargado hace un primer recuento en la app.

create table if not exists producto_stock_sede (
  producto_id uuid not null references productos(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  stock_minimo integer not null default 3 check (stock_minimo >= 0),
  stock_ideal integer not null default 10 check (stock_ideal >= 0),
  updated_at timestamptz not null default now(),
  primary key (producto_id, sede_id)
);

create table if not exists stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  tipo text not null check (tipo in ('venta', 'entrada', 'recuento', 'ajuste')),
  -- Unidades que suma (+) o resta (−) el movimiento.
  cantidad integer not null,
  stock_resultante integer not null,
  nota text,
  cita_id uuid references citas(id) on delete set null,
  admin_id uuid references admins(id) on delete set null,
  admin_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movimientos_sede_fecha_idx on stock_movimientos (sede_id, created_at desc);
create index if not exists stock_movimientos_producto_idx on stock_movimientos (producto_id, created_at desc);

alter table sedes add column if not exists encargado_stock_admin_id uuid references admins(id) on delete set null;

-- Solo se accede desde el servidor (service role), igual que el resto del panel.
alter table producto_stock_sede enable row level security;
alter table stock_movimientos enable row level security;

-- p_tipo:
--   'venta'    → resta p_cantidad (nunca baja de 0: una venta real no se
--                bloquea por un conteo desactualizado)
--   'entrada'  → suma p_cantidad (llega un pedido)
--   'ajuste'   → suma o resta p_cantidad (rotura, regalo, error…)
--   'recuento' → el stock pasa a ser p_cantidad (conteo físico)
-- Devuelve el stock nuevo.
create or replace function registrar_movimiento_stock(
  p_producto_id uuid,
  p_sede_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_nota text default null,
  p_cita_id uuid default null,
  p_admin_id uuid default null,
  p_admin_nombre text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual integer;
  v_nuevo integer;
begin
  if p_tipo not in ('venta', 'entrada', 'recuento', 'ajuste') then
    raise exception 'Tipo de movimiento no válido: %', p_tipo;
  end if;
  if p_tipo in ('venta', 'entrada', 'recuento') and p_cantidad < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  insert into producto_stock_sede (producto_id, sede_id)
  values (p_producto_id, p_sede_id)
  on conflict (producto_id, sede_id) do nothing;

  select stock into v_actual
  from producto_stock_sede
  where producto_id = p_producto_id and sede_id = p_sede_id
  for update;

  v_nuevo := case p_tipo
    when 'venta' then greatest(0, v_actual - p_cantidad)
    when 'entrada' then v_actual + p_cantidad
    when 'ajuste' then greatest(0, v_actual + p_cantidad)
    when 'recuento' then p_cantidad
  end;

  update producto_stock_sede
  set stock = v_nuevo, updated_at = now()
  where producto_id = p_producto_id and sede_id = p_sede_id;

  insert into stock_movimientos (producto_id, sede_id, tipo, cantidad, stock_resultante, nota, cita_id, admin_id, admin_nombre)
  values (p_producto_id, p_sede_id, p_tipo, v_nuevo - v_actual, v_nuevo, p_nota, p_cita_id, p_admin_id, p_admin_nombre);

  return v_nuevo;
end;
$$;

revoke all on function registrar_movimiento_stock(uuid, uuid, text, integer, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function registrar_movimiento_stock(uuid, uuid, text, integer, text, uuid, uuid, text) to service_role;
