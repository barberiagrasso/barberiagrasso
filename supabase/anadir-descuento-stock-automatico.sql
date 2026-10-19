-- Descuento automático de stock al vender un producto en una cita.
--
-- productos.stock es opcional (NULL = "no controlado", comportamiento de
-- siempre, sin forzar a Diego a rellenar stock de todo su catálogo
-- existente). Para un producto con stock sí controlado, cada vez que se
-- vende dentro de "Finalizar cita" se descuenta la cantidad vendida.
--
-- Igual que registrar_movimiento_saldo() (ver actualizar-fidelizacion.sql):
-- bloquea la fila del producto mientras calcula el nuevo stock, para que
-- dos cierres de cita casi simultáneos que vendan el mismo producto no se
-- pisen entre sí. Nunca baja de 0 ni lanza error si el stock ya no
-- alcanza — una venta real no se puede bloquear por un conteo de stock
-- desactualizado; si el stock queda en 0 o negativo-saturado-a-0, el
-- aviso de "stock bajo" en /admin/productos ya se lo hace notar a Diego.
--
-- Re-ejecutable: puedes volver a pegar este archivo en el SQL Editor de
-- Supabase sin que rompa nada si ya lo tienes aplicado.

create or replace function descontar_stock_producto(
  p_producto_id uuid,
  p_cantidad int
) returns int
language plpgsql
as $$
declare
  v_stock_actual int;
  v_nuevo_stock int;
begin
  if p_cantidad <= 0 then
    return null;
  end if;

  select stock into v_stock_actual
  from productos
  where id = p_producto_id
  for update;

  -- Producto no encontrado, o encontrado pero sin stock controlado
  -- (NULL): no hay nada que descontar.
  if v_stock_actual is null then
    return null;
  end if;

  v_nuevo_stock := greatest(0, v_stock_actual - p_cantidad);

  update productos set stock = v_nuevo_stock where id = p_producto_id;

  return v_nuevo_stock;
end;
$$;
