-- Arregla los servicios que se dieron de alta desde el panel sin ningún
-- barbero asignado (22/10/2026).
--
-- Síntoma: al reservar uno de esos servicios, en el paso "Barbero, día y
-- hora" solo salía "Cualquiera" y el calendario quedaba entero en gris,
-- porque ningún barbero "hacía" ese servicio. El panel creaba el
-- servicio pero no lo asignaba a nadie (ya está corregido en el código:
-- los servicios nuevos se asignan a todos los barberos activos).
--
-- Qué hace este script (se puede ejecutar varias veces sin problema):
--   1. Los servicios activos cuyo nombre lleva "David" (p. ej. "Corte con
--      David Grasso") y que no tienen ningún barbero → se asignan SOLO a
--      David.
--   2. El resto de servicios activos sin ningún barbero → se asignan a
--      todos los barberos activos.
-- No toca ningún servicio que ya tenga al menos un barbero asignado.
--
-- Cómo usarlo: Supabase → SQL Editor → pega este archivo entero → Run.
-- Después, si algún barbero no hace alguno de estos servicios, desmárcalo
-- en el panel → Equipo.

begin;

-- Antes de tocar nada: qué servicios activos no tienen ningún barbero.
create temporary table servicios_sin_barbero on commit drop as
select s.id, s.nombre
from servicios s
where s.activo
  and not exists (select 1 from profesional_servicios ps where ps.servicio_id = s.id);

-- 1. Servicios "con David": solo David.
insert into profesional_servicios (profesional_id, servicio_id)
select p.id, s.id
from servicios_sin_barbero s
join profesionales p on p.nombre = 'David' and p.activo
where s.nombre ilike '%david%'
on conflict do nothing;

-- 2. El resto: todos los barberos activos.
insert into profesional_servicios (profesional_id, servicio_id)
select p.id, s.id
from servicios_sin_barbero s
cross join profesionales p
where p.activo
  and s.nombre not ilike '%david%'
on conflict do nothing;

-- Resultado: cada servicio que estaba sin barberos y quién lo hace ahora.
select s.nombre as servicio, string_agg(p.nombre, ', ' order by p.nombre) as barberos
from servicios_sin_barbero s
left join profesional_servicios ps on ps.servicio_id = s.id
left join profesionales p on p.id = ps.profesional_id
group by s.nombre
order by s.nombre;

commit;
