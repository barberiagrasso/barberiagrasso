-- =====================================================================
-- Barbería Grasso — Datos reales (servicios, precios, horarios, barberos)
-- =====================================================================
-- Ejecuta esto en el SQL Editor de Supabase (New query → pegar → Run).
-- Sustituye TODOS los datos de ejemplo de seed.sql por los reales.
--
-- Si este script falla en algún paso de borrado con un error de
-- "foreign key" / "violates constraint", es porque ya tienes alguna
-- cita de prueba en el sistema. Cancela o borra esas citas de prueba
-- (tabla `citas`, o desde el panel /admin/dashboard) y vuelve a
-- ejecutar este script.
-- =====================================================================

-- 0. Limpiar vínculos y datos de ejemplo, en el orden correcto
-- (primero lo que depende de servicios/profesionales, luego ellos).
delete from profesional_servicios;
delete from sede_servicios;
delete from horarios;
delete from profesional_sedes;
delete from profesionales;
delete from servicios;

-- 1. Catálogo real de servicios, con sus precios.
-- Nota: por ahora todos los servicios ocupan un hueco de 30 minutos en
-- la agenda (así me lo confirmaste). Si alguno de estos (por ejemplo
-- Mechas, Platinados o Rastas) necesita más tiempo en la práctica,
-- cámbiaselo luego en Table Editor → servicios → duracion_minutos, sin
-- tocar nada más.
--
-- El precio "con David" se indica como texto informativo en la
-- descripción (se ve en la app y el asistente de WhatsApp lo menciona
-- si preguntan) — el cobro final se hace en el propio local.
insert into servicios (nombre, descripcion, duracion_minutos, precio_centimos) values
  ('Corte', 'Con David (dueño): 18,00€', 30, 1600),
  ('Barba', null, 30, 1200),
  ('Corte y barba', 'Con David (dueño): 25,00€', 30, 2300),
  ('Grasso Kids (hasta 7 años) — lunes a jueves', null, 30, 1199),
  ('Grasso Kids (hasta 7 años) — fin de semana', null, 30, 1398),
  ('Matización de cabello', null, 30, 1400),
  ('Platinados y colores fantasía', null, 90, 6990),
  ('Mechas', null, 90, 4499),
  ('Tinte para barba', null, 30, 896),
  ('Tinte para cabello', null, 30, 1270),
  ('Oxigenación higiénica', null, 30, 2000),
  ('Tratamiento de oxigenación terapéutica', null, 30, 3500),
  ('Oxigenación TPI — limpieza profunda', null, 30, 4000),
  ('Mantenimiento de rastas', null, 30, 7000),
  ('Pack Grasso Experience', null, 30, 3900),
  ('Pack Grasso Visagismo', null, 30, 3299),
  ('Pack Grasso Full Oxygen', null, 30, 3400),
  ('Asesoría de prótesis capilar', 'Gratuita', 30, 0),
  ('Complemento: cejas', 'Complemento sobre otro servicio', 30, 350),
  ('Complemento: masaje anti-estrés', 'Complemento sobre otro servicio', 30, 486),
  ('Complemento: lavado', 'Complemento sobre otro servicio', 30, 200),
  ('Complemento: depilación de nariz', 'Complemento sobre otro servicio', 30, 600);

-- 2. Barberos reales.
-- Nota: hay dos personas distintas llamadas "Juan" (una en cada sede),
-- así que se distinguen con el nombre de la sede entre paréntesis. Si
-- prefieres otro nombre para diferenciarlos (apodo, apellido...), lo
-- puedes cambiar luego directamente en Table Editor → profesionales.
insert into profesionales (nombre) values
  ('David'),
  ('Cristian'),
  ('Lucas'),
  ('Juan (Avenida de las Ciudades)'),
  ('Arthur'),
  ('Daniel'),
  ('Juan (Los Molinos)');

-- 3. Vincular cada barbero a su sede (David va a las dos)
insert into profesional_sedes (profesional_id, sede_id)
select p.id, s.id
from profesionales p
join sedes s on
  (p.nombre = 'Cristian' and s.slug = 'avenida-de-las-ciudades') or
  (p.nombre = 'Lucas' and s.slug = 'avenida-de-las-ciudades') or
  (p.nombre = 'Juan (Avenida de las Ciudades)' and s.slug = 'avenida-de-las-ciudades') or
  (p.nombre = 'Arthur' and s.slug = 'los-molinos') or
  (p.nombre = 'Daniel' and s.slug = 'los-molinos') or
  (p.nombre = 'Juan (Los Molinos)' and s.slug = 'los-molinos')
where p.nombre != 'David';

-- David, en ambas sedes:
insert into profesional_sedes (profesional_id, sede_id)
select p.id, s.id from profesionales p cross join sedes s where p.nombre = 'David';

-- 4. De momento, cada barbero realiza todos los servicios del catálogo.
-- Esto es una suposición para que la reserva funcione desde ya. Si
-- algún barbero NO hace algún servicio (por ejemplo, alguien que no
-- hace tintes o rastas), bórralo luego en Table Editor →
-- profesional_servicios: busca la fila con su nombre y el servicio en
-- cuestión, y elimínala. Así ese barbero dejará de aparecer como
-- opción para ese servicio.
insert into profesional_servicios (profesional_id, servicio_id)
select p.id, s.id from profesionales p cross join servicios s;

-- 5. Horario real: todos los días excepto domingo, de 9:30 a 20:30.
-- (dia_semana: 0 = domingo ... 6 = sábado; al no crear fila para el 0,
-- el domingo queda cerrado automáticamente, sin necesidad de bloqueo).
insert into horarios (profesional_id, sede_id, dia_semana, hora_inicio, hora_fin)
select ps.profesional_id, ps.sede_id, dia, '09:30'::time, '20:30'::time
from profesional_sedes ps
cross join (values (1), (2), (3), (4), (5), (6)) as d(dia);
