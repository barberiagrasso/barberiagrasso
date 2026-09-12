-- =====================================================================
-- Barbería Grasso — Datos de ejemplo (opcional)
-- =====================================================================
-- Ejecuta esto DESPUÉS de schema.sql si quieres arrancar con datos de
-- prueba para ver la app funcionando. Luego edítalos o bórralos desde
-- el panel de control. Los horarios son de ejemplo: ajústalos a los
-- reales de cada sede antes de lanzar.
-- =====================================================================

insert into sedes (nombre, slug, direccion, telefono) values
  ('Los Molinos', 'los-molinos', 'Dirección de Los Molinos (edítala en el panel)', ''),
  ('Avenida de las Ciudades', 'avenida-de-las-ciudades', 'Dirección de Avenida de las Ciudades (edítala en el panel)', '');

insert into servicios (nombre, descripcion, duracion_minutos, precio_centimos) values
  ('Corte de pelo', 'Corte clásico o a máquina', 30, 1500),
  ('Arreglo de barba', 'Perfilado y arreglo de barba', 20, 1000),
  ('Corte + barba', 'Servicio combinado', 45, 2200);

-- Un profesional de ejemplo por sede (edita los nombres reales luego en el panel)
insert into profesionales (nombre) values
  ('Barbero Los Molinos'),
  ('Barbero Avenida');

insert into profesional_sedes (profesional_id, sede_id)
select p.id, s.id
from profesionales p
join sedes s on
  (p.nombre = 'Barbero Los Molinos' and s.slug = 'los-molinos') or
  (p.nombre = 'Barbero Avenida' and s.slug = 'avenida-de-las-ciudades');

-- Todos los profesionales realizan todos los servicios (ajústalo si no es así)
insert into profesional_servicios (profesional_id, servicio_id)
select p.id, s.id from profesionales p cross join servicios s;

-- Horario de ejemplo: martes a sábado, 10:00-14:00 y 16:00-20:00
insert into horarios (profesional_id, sede_id, dia_semana, hora_inicio, hora_fin)
select ps.profesional_id, ps.sede_id, d.dia, d.hora_inicio, d.hora_fin
from profesional_sedes ps
cross join (
  values
    (2, '10:00'::time, '14:00'::time),
    (2, '16:00'::time, '20:00'::time),
    (3, '10:00'::time, '14:00'::time),
    (3, '16:00'::time, '20:00'::time),
    (4, '10:00'::time, '14:00'::time),
    (4, '16:00'::time, '20:00'::time),
    (5, '10:00'::time, '14:00'::time),
    (5, '16:00'::time, '20:00'::time),
    (6, '10:00'::time, '14:00'::time),
    (6, '16:00'::time, '20:00'::time)
) as d(dia, hora_inicio, hora_fin);
