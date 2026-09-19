-- Dos columnas nuevas en citas, para el checkout rediseñado de
-- "Finalizar cita" (FinalizarCitaModal.tsx):
--
-- 1. citas.metodo_pago: cómo pagó el cliente (efectivo, tarjeta, bizum u
--    otro). Puramente informativo por ahora — no entra en ningún cálculo,
--    solo queda guardado en la cita para tenerlo a mano si Diego lo quiere
--    consultar más adelante.
--
-- 2. citas.precio_final_centimos: si el barbero corrige a mano el importe
--    final al cerrar la cita (por ejemplo, un descuento dado en persona o
--    un redondeo), este es el número que manda a partir de ahí. Cuando es
--    NULL (el caso normal, no se ha tocado nada) se sigue calculando como
--    siempre: precio del servicio + complementos. Este override es el que
--    ahora usan TODOS los sitios que facturan sobre una cita — comisiones
--    de barberos, fidelización del cliente, HubSpot y el historial del
--    propio cliente — para que el número cuadre igual en todas partes
--    (ver lib/precios.ts).

alter table citas add column if not exists metodo_pago text;
alter table citas add constraint citas_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('efectivo', 'tarjeta', 'bizum', 'otro'));

alter table citas add column if not exists precio_final_centimos integer;
alter table citas add constraint citas_precio_final_no_negativo
  check (precio_final_centimos is null or precio_final_centimos >= 0);
