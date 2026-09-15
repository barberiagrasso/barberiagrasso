-- =====================================================================
-- Sistema de comisiones para barberos
-- =====================================================================
-- Añade la tabla comisiones_tramos: los tramos de facturación mensual
-- que definen qué porcentaje de comisión cobra cada barbero, editables
-- desde el panel (solo por el rol "admin"). Ejecutar una sola vez en
-- Supabase Dashboard → SQL Editor (ya aplicada en producción).
--
-- Cómo funciona el cálculo (ver lib/comisiones.ts):
-- * Se mira en qué tramo cae el TOTAL facturado ese mes por el barbero
--   (no es progresivo por escalones como el IRPF).
-- * Ese porcentaje se aplica a TODA la facturación del mes, no solo a
--   la parte dentro del tramo.
-- * Por debajo del tramo más bajo (huecos incluidos), la comisión es 0.
-- * El tramo es [desde, hasta): el límite inferior cuenta para ese
--   tramo, el superior ya es del siguiente. hasta_centimos = NULL en el
--   último tramo ("a partir de X€, sin límite superior").
-- =====================================================================

create table comisiones_tramos (
  id uuid primary key default gen_random_uuid(),
  desde_centimos integer not null check (desde_centimos >= 0),
  hasta_centimos integer,
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  created_at timestamptz not null default now(),
  check (hasta_centimos is null or hasta_centimos > desde_centimos)
);

alter table comisiones_tramos enable row level security;
create policy "comisiones_tramos_admin_all" on comisiones_tramos for all using (is_admin()) with check (is_admin());

-- Tramos iniciales tal y como los definió Diego (12/09/2026): por debajo
-- de 3.500€ de facturación mensual no hay comisión variable.
insert into comisiones_tramos (desde_centimos, hasta_centimos, porcentaje) values
  (350000, 380000, 35.00),
  (380000, 400000, 38.00),
  (400000, 450000, 40.00),
  (450000, null, 42.00);

-- Sustituye TODOS los tramos de golpe (se usa desde el panel al guardar
-- los cambios del administrador): borrado + inserción dentro de la
-- misma transacción de la función, para que nunca haya una lectura a
-- medio camino con la tabla vacía si dos peticiones coinciden.
--
-- "where true" en el delete no es decorativo: Supabase bloquea por
-- defecto cualquier DELETE/UPDATE sin cláusula WHERE (protección
-- estándar contra borrados masivos accidentales), así que un
-- "delete from comisiones_tramos;" a secas falla con el error "DELETE
-- requires a WHERE clause". "where true" sigue borrando exactamente lo
-- mismo (todas las filas) pero sí cuenta como una cláusula WHERE válida.
create or replace function reemplazar_tramos_comision(nuevos jsonb)
returns setof comisiones_tramos
language plpgsql
as $$
begin
  delete from comisiones_tramos where true;
  insert into comisiones_tramos (desde_centimos, hasta_centimos, porcentaje)
  select
    (t->>'desdeCentimos')::integer,
    (t->>'hastaCentimos')::integer,
    (t->>'porcentaje')::numeric
  from jsonb_array_elements(nuevos) as t;
  return query select * from comisiones_tramos order by desde_centimos;
end;
$$;
