-- =====================================================================
-- Descuento por % en el checkout (FinalizarCitaModal.tsx), con motivo
-- obligatorio. Pedido de Diego (19/09/2026): sustituye la edición manual
-- del precio para el caso concreto de "hacer un descuento" (ofertas de la
-- barbería o detalles puntuales a un cliente) — el precio final que
-- cobra el cliente sigue guardándose en citas.precio_final_centimos como
-- siempre (ver anadir-pago-y-precio-final.sql), estas dos columnas solo
-- guardan CÓMO se llegó a ese número, para poder:
--   1. Que el barbero siga comisionando por el total SIN descontar (ver
--      ingresoCitaCentimos en app/api/admin/comisiones/route.ts: cuando
--      hay descuento_porcentaje, la comisión ignora precio_final_centimos
--      y usa el precio automático de catálogo).
--   2. Que Diego pueda revisar todos los descuentos aplicados desde
--      Informes → Descuentos (app/api/admin/informes/descuentos).
-- Null en ambas columnas = no se aplicó ningún descuento estructurado en
-- esta cita (el caso normal); si el barbero corrigió el precio a mano por
-- otro motivo (redondeo, error...), eso sigue sin pasar por aquí.

alter table citas add column if not exists descuento_porcentaje numeric;
alter table citas add constraint citas_descuento_porcentaje_valido
  check (descuento_porcentaje is null or (descuento_porcentaje > 0 and descuento_porcentaje <= 100));

alter table citas add column if not exists descuento_motivo text;
-- El motivo es obligatorio cuando hay un % de descuento (se valida también
-- en el servidor, en app/api/admin/citas/[id]/finalizar/route.ts, pero se
-- deja también como constraint para que nunca pueda colarse un descuento
-- sin motivo aunque se escriba directamente en la base de datos).
alter table citas add constraint citas_descuento_motivo_obligatorio
  check (descuento_porcentaje is null or (descuento_motivo is not null and length(trim(descuento_motivo)) > 0));
