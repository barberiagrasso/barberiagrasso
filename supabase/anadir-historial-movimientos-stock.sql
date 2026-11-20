-- Historial de movimientos de stock (pedido de Diego, 13/11/2026): el
-- stock y el stock mínimo con aviso de "bajo" ya existen (ver
-- anadir-auditoria-stock-programacion-solapamiento.sql), pero hasta
-- ahora cada venta o cada edición manual pisaba el número sin dejar
-- rastro — no se podía saber por qué había bajado el stock de un
-- producto. Esta migración es aditiva: no toca ni borra nada existente.

-- Igual criterio que saldo_fidelizacion_movimientos / grassocoins_movimientos:
-- de solo lectura desde el panel (nadie edita ni borra una fila, ni
-- siquiera un admin), y solo se escribe a través de
-- registrar_movimiento_stock() con el service role, nunca directamente
-- desde el panel.
create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  -- Cantidad realmente aplicada (con signo: positiva en una entrada,
  -- negativa en una salida; un ajuste puede ser cualquiera de las dos).
  -- Puede no coincidir con la cantidad pedida si el stock se quedó corto
  -- y se tuvo que recortar a 0 (ver registrar_movimiento_stock).
  cantidad integer not null,
  stock_resultante integer not null,
  motivo text,
  -- Solo presente cuando el movimiento viene de vender el producto en
  -- una cita (ver app/api/admin/citas/[id]/finalizar/route.ts).
  cita_id uuid references citas(id) on delete set null,
  creado_por text not null default 'sistema',
  created_at timestamptz not null default now()
);
create index movimientos_stock_producto_idx on movimientos_stock(producto_id, created_at desc);

alter table movimientos_stock enable row level security;
create policy "movimientos_stock_admin_read" on movimientos_stock for select using (is_admin());
-- A propósito NO hay política de insert/update/delete por RLS: solo
-- escribe el backend (service role) a través de la función de abajo.

-- Aplica un movimiento de stock y deja el rastro en una sola
-- transacción (mismo patrón que registrar_movimiento_saldo /
-- registrar_movimiento_grassocoins). Si el producto no lleva stock
-- controlado (stock = NULL), no hay nada que mover ni que registrar, y
-- se devuelve NULL sin tocar nada — igual comportamiento que ya tenía
-- descontar_stock_producto().
create or replace function registrar_movimiento_stock(
  p_producto_id uuid,
  p_tipo text,
  p_delta integer,
  p_motivo text default null,
  p_cita_id uuid default null,
  p_creado_por text default 'sistema'
) returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_stock_actual int;
  v_nuevo_stock int;
begin
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento de stock no válido: %', p_tipo;
  end if;
  if p_delta = 0 then
    raise exception 'El movimiento de stock no puede tener cantidad 0';
  end if;

  select stock into v_stock_actual
  from productos
  where id = p_producto_id
  for update;

  if v_stock_actual is null then
    return null;
  end if;

  v_nuevo_stock := greatest(0, v_stock_actual + p_delta);

  update productos set stock = v_nuevo_stock where id = p_producto_id;

  insert into movimientos_stock
    (producto_id, tipo, cantidad, stock_resultante, motivo, cita_id, creado_por)
  values
    (p_producto_id, p_tipo, v_nuevo_stock - v_stock_actual, v_nuevo_stock, p_motivo, p_cita_id, coalesce(p_creado_por, 'sistema'));

  return v_nuevo_stock;
end;
$$;

-- Nota: descontar_stock_producto() (la función anterior) se deja tal
-- cual, sin usarla ya desde el código — mismo criterio aditivo que el
-- resto de este proyecto, nunca se borra lo que ya había.
