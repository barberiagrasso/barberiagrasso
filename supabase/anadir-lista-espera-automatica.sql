-- =====================================================================
-- Lista de espera con reserva automática
-- =====================================================================
-- Ejecutar una sola vez en Supabase Dashboard → SQL Editor (o vía
-- mcp__Supabase__apply_migration). Añade:
--
-- 1. lista_espera.flexibilidad_dias: cuántos días antes/después de la
--    fecha pedida le sirven al cliente (0 = solo ese día exacto, 1 = ±1
--    día, 2 = ±2 días) — decisión de Diego (17/09/2026): el paso de
--    fecha de app/reservar ahora pregunta esto al apuntarse.
-- 2. Un índice por sede+estado+fecha: la asignación automática, al
--    cancelarse una cita, busca candidatos de la lista de espera de esa
--    sede que sigan "pendiente" y cuya fecha caiga cerca de la que se ha
--    liberado — antes no hacía falta, con la sola comprobación por
--    fecha exacta que hacía el aviso manual.
-- 3. citas.origen admite ahora 'lista_espera', para poder distinguir en
--    los informes las citas que se crearon solas al liberarse un hueco
--    de las que reserva el propio cliente.
-- =====================================================================

alter table lista_espera
  add column flexibilidad_dias smallint not null default 0 check (flexibilidad_dias in (0, 1, 2));

create index if not exists lista_espera_sede_estado_fecha_idx on lista_espera (sede_id, estado, fecha);

alter table citas drop constraint citas_origen_check;
alter table citas add constraint citas_origen_check check (origen in ('app', 'panel', 'whatsapp', 'lista_espera'));
