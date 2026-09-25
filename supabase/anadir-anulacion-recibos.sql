-- Anular y archivar el recibo de una cita ya completada (pedido de Diego,
-- 25/09/2026): permite deshacer el efecto en facturación/comisión de una
-- cita cobrada por error o que hay que corregir, sin borrar su historial
-- (la cita sigue existiendo y contando como "completada" a efectos de
-- visitas del cliente, solo deja de contar como dinero real). Ver
-- lib/recibo.ts y app/api/admin/citas/[id]/anular-recibo/route.ts.
--
-- Re-ejecutable: puedes pegar este archivo en el SQL Editor de Supabase
-- las veces que haga falta sin que rompa nada si ya lo tienes aplicado.
alter table citas add column if not exists recibo_anulado_at timestamptz;
alter table citas add column if not exists recibo_anulado_por text;
alter table citas add column if not exists recibo_anulado_motivo text;

-- Momento exacto en que se cobró la cita (se rellena en
-- app/api/admin/citas/[id]/finalizar/route.ts junto con estado =
-- 'completada'), para poder mostrarlo en el recibo — distinto de
-- `inicio` (la hora de la cita) y de `created_at` (cuándo se reservó).
-- Las citas completadas antes de este cambio se quedan sin este dato
-- (null): el recibo, en ese caso, usa `inicio` como aproximación.
alter table citas add column if not exists pagado_at timestamptz;

comment on column citas.recibo_anulado_at is 'Cuándo se anuló/archivó el recibo de esta cita (null = recibo activo). Al anularlo deja de contar en facturación e informes, pero la cita sigue existiendo.';
comment on column citas.recibo_anulado_por is 'Nombre del administrador que anuló el recibo.';
comment on column citas.recibo_anulado_motivo is 'Motivo obligatorio de la anulación, para que Diego pueda revisar por qué se quitó esa facturación.';
comment on column citas.pagado_at is 'Momento en que se cerró/cobró la cita desde el checkout de Finalizar cita.';
