-- Dos columnas nuevas para la Agenda:
--
-- 1. servicios.color: para pintar cada cita del calendario con el color
--    de su servicio (leyenda de colores pedida por Diego). Se rellenan
--    los servicios ya existentes con una paleta fija (mismo orden en que
--    se ven en /admin/mi-barbería) para que ninguno se quede sin color;
--    a partir de ahora, la propia app asigna uno nuevo por rotación al
--    crear un servicio, y Diego puede cambiarlo a mano cuando quiera.
--
-- 2. citas.profesional_elegido_por_cliente: si el cliente pidió
--    expresamente ESE barbero al reservar (no "Cualquiera"). No se podía
--    deducir esto de profesional_id porque esa columna ya guarda el
--    barbero asignado en los dos casos — hace falta guardar la intención
--    en el momento de reservar. Se usa para el icono de corazón de la
--    Agenda.

alter table servicios add column if not exists color text;

with paleta(idx, color) as (
  values
    (0, '#f59e0b'), -- ámbar
    (1, '#0ea5e9'), -- azul
    (2, '#8b5cf6'), -- morado
    (3, '#10b981'), -- verde
    (4, '#ef4444'), -- rojo
    (5, '#ec4899'), -- rosa
    (6, '#14b8a6'), -- turquesa
    (7, '#6366f1')  -- índigo
),
numerados as (
  select id, (row_number() over (order by categoria nulls first, orden, nombre) - 1) % 8 as idx
  from servicios
)
update servicios s
set color = p.color
from numerados n
join paleta p on p.idx = n.idx
where s.id = n.id and s.color is null;

alter table citas add column if not exists profesional_elegido_por_cliente boolean not null default false;
