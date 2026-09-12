-- =====================================================================
-- Barbería Grasso — Datos reales (servicios, precios, horarios, barberos,
-- direcciones)
-- =====================================================================
-- Ejecuta esto en el SQL Editor de Supabase (New query → pegar → Run).
-- Se puede volver a ejecutar entero cuantas veces quieras: en vez de
-- borrar y recrear los servicios y barberos (lo que rompía en cuanto ya
-- había alguna cita reservada), esta versión los actualiza si ya
-- existen y solo crea los que falten — así nunca vuelve a chocar con
-- las citas ya guardadas.
--
-- Todo el script va dentro de una única transacción (begin/commit): si
-- algo fallase a mitad, no se queda nada a medias — o se aplica entero,
-- o no se aplica nada.
-- =====================================================================

begin;

-- 0. Columnas nuevas (si ya las tienes de una ejecución anterior, esto
-- no hace nada) y una restricción de "nombre único" en servicios y
-- profesionales, para poder actualizar por nombre en vez de borrar y
-- recrear.
alter table servicios add column if not exists categoria text;
alter table servicios add column if not exists orden int not null default 0;
alter table sedes add column if not exists maps_url text;
create unique index if not exists servicios_nombre_key on servicios (nombre);
create unique index if not exists profesionales_nombre_key on profesionales (nombre);

-- 1. Direcciones reales y enlace a Google Maps de cada sede.
update sedes set
  direccion = 'Av. de las Ciudades, 90, 28903 Getafe, Madrid',
  maps_url = 'https://www.google.com/maps/place//data=!4m2!3m1!1s0xd4221d2b424c9b5:0xce2788d6ac619727?sa=X&ved=1t:8290&ictx=111'
where slug = 'avenida-de-las-ciudades';

update sedes set
  direccion = 'Av. Rocinante, 6, 28906 Getafe, Madrid',
  maps_url = 'https://www.google.com/maps/place//data=!4m2!3m1!1s0xd4221efd664214f:0x3393f2fd7a791c17?sa=X&ved=1t:8290&ictx=111'
where slug = 'los-molinos';

-- 2. Renombra a su nombre nuevo los servicios que vinieran de una
-- versión anterior de este script (para conservar el mismo servicio,
-- por si alguna cita ya lo usa) — si no existen con el nombre viejo,
-- esto simplemente no hace nada.
update servicios set nombre = 'Kids (lunes a jueves)' where nombre = 'Grasso Kids (hasta 7 años) — lunes a jueves';
update servicios set nombre = 'Kids (fin de semana)' where nombre = 'Grasso Kids (hasta 7 años) — fin de semana';
update servicios set nombre = 'Cejas' where nombre = 'Complemento: cejas';
update servicios set nombre = 'Masaje anti-estrés' where nombre = 'Complemento: masaje anti-estrés';
update servicios set nombre = 'Lavado' where nombre = 'Complemento: lavado';
update servicios set nombre = 'Depilación de nariz' where nombre = 'Complemento: depilación de nariz';

-- 3. Catálogo real de servicios: crea los que falten y actualiza los
-- que ya existan (precio, duración, descripción, categoría y orden),
-- sin tocar su id ni las citas que ya los usan.
--
-- `categoria` = NULL → uno de los 4 servicios principales, que se ven
-- siempre directamente en el paso de reserva (en este orden: Corte,
-- Barba, Corte y barba, Asesoría de prótesis capilar).
-- `categoria` = un nombre → el servicio vive dentro de ese desplegable,
-- en el orden de los desplegables que pediste: Grasso Kids, Complementos,
-- Tintes Grasso, Tratamientos capilares, Packs Grasso.
--
-- Duración: 30 minutos para todos salvo Platinados y Mechas (90 min,
-- así lo confirmaste). Si algún otro necesita más tiempo en la
-- práctica, cámbiaselo luego en Table Editor → servicios →
-- duracion_minutos, sin tocar nada más.
--
-- El precio "con David" se indica como texto informativo en la
-- descripción (se ve en la app y el asistente de WhatsApp lo menciona
-- si preguntan) — el cobro final se hace en el propio local.
insert into servicios (nombre, descripcion, duracion_minutos, precio_centimos, categoria, orden, activo)
values
  -- Los 4 principales
  ('Corte', 'Con David (dueño): 18,00€', 30, 1600, null, 1, true),
  ('Barba', null, 30, 1200, null, 2, true),
  ('Corte y barba', 'Con David (dueño): 25,00€', 30, 2300, null, 3, true),
  ('Asesoría de prótesis capilar', 'Gratuita', 30, 0, null, 4, true),

  -- Grasso Kids (hasta 7 años)
  ('Kids (lunes a jueves)', null, 30, 1199, 'Grasso Kids (hasta 7 años)', 1, true),
  ('Kids (fin de semana)', null, 30, 1398, 'Grasso Kids (hasta 7 años)', 2, true),

  -- Complementos (se muestran con su nombre sin más, sin la palabra
  -- "complemento" delante — pero siguen pudiéndose reservar solos aquí,
  -- o añadirse como extra a otro servicio en el paso siguiente)
  ('Cejas', null, 30, 350, 'Complementos', 1, true),
  ('Masaje anti-estrés', null, 30, 486, 'Complementos', 2, true),
  ('Lavado', null, 30, 200, 'Complementos', 3, true),
  ('Depilación de nariz', null, 30, 600, 'Complementos', 4, true),

  -- Tintes Grasso
  ('Matización de cabello', null, 30, 1400, 'Tintes Grasso', 1, true),
  ('Platinados y colores fantasía', null, 90, 6990, 'Tintes Grasso', 2, true),
  ('Mechas', null, 90, 4499, 'Tintes Grasso', 3, true),
  ('Tinte para barba', null, 30, 896, 'Tintes Grasso', 4, true),
  ('Tinte para cabello', null, 30, 1270, 'Tintes Grasso', 5, true),

  -- Tratamientos capilares (incluye Rastas)
  ('Oxigenación higiénica', null, 30, 2000, 'Tratamientos capilares', 1, true),
  ('Tratamiento de oxigenación terapéutica', null, 30, 3500, 'Tratamientos capilares', 2, true),
  ('Oxigenación TPI — limpieza profunda', null, 30, 4000, 'Tratamientos capilares', 3, true),
  ('Mantenimiento de rastas', null, 30, 7000, 'Tratamientos capilares', 4, true),

  -- Packs Grasso (la Asesoría de prótesis capilar ya está arriba como
  -- principal, así que no se repite aquí)
  ('Pack Grasso Experience', null, 30, 3900, 'Packs Grasso', 1, true),
  ('Pack Grasso Visagismo', null, 30, 3299, 'Packs Grasso', 2, true),
  ('Pack Grasso Full Oxygen', null, 30, 3400, 'Packs Grasso', 3, true)
on conflict (nombre) do update set
  descripcion = excluded.descripcion,
  duracion_minutos = excluded.duracion_minutos,
  precio_centimos = excluded.precio_centimos,
  categoria = excluded.categoria,
  orden = excluded.orden,
  activo = true;

-- Cualquier servicio de ejemplo antiguo que quedara (de las primeras
-- pruebas) se desactiva en vez de borrarse, así no rompe ninguna cita
-- antigua que lo use — simplemente deja de ofrecerse en la reserva.
update servicios set activo = false
where nombre in ('Corte de pelo', 'Arreglo de barba', 'Corte + barba');

-- 4. Barberos reales: crea los que falten y reactiva los que ya
-- existan. Nota: hay dos personas distintas llamadas "Juan" (una en
-- cada sede), así que se distinguen con el nombre de la sede entre
-- paréntesis. Si prefieres otro nombre para diferenciarlos (apodo,
-- apellido...), lo puedes cambiar luego directamente en Table Editor →
-- profesionales.
insert into profesionales (nombre, activo) values
  ('David', true),
  ('Cristian', true),
  ('Lucas', true),
  ('Juan (Avenida de las Ciudades)', true),
  ('Arthur', true),
  ('Daniel', true),
  ('Juan (Los Molinos)', true)
on conflict (nombre) do update set activo = true;

-- Barberos de ejemplo antiguos: se desactivan en vez de borrarse (por
-- si ya tienen alguna cita), así dejan de aparecer como opción.
update profesionales set activo = false
where nombre in ('Barbero Los Molinos', 'Barbero Avenida');

-- 5. Vínculos barbero↔sede, barbero↔servicio y horarios: estos no los
-- usa ninguna cita directamente, así que sí se pueden borrar y volver a
-- crear sin ningún riesgo cada vez que se ejecuta el script.
delete from profesional_sedes;
delete from profesional_servicios;
delete from horarios;

-- Vincular cada barbero activo a su sede (David va a las dos)
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
where p.activo and p.nombre != 'David';

insert into profesional_sedes (profesional_id, sede_id)
select p.id, s.id from profesionales p cross join sedes s where p.nombre = 'David' and p.activo;

-- De momento, cada barbero activo realiza todos los servicios activos
-- del catálogo. Esto es una suposición para que la reserva funcione
-- desde ya. Si algún barbero NO hace algún servicio (p. ej. alguien que
-- no hace tintes o rastas), bórralo luego en Table Editor →
-- profesional_servicios: busca la fila con su nombre y el servicio en
-- cuestión, y elimínala. Así ese barbero dejará de aparecer como opción
-- para ese servicio.
insert into profesional_servicios (profesional_id, servicio_id)
select p.id, s.id from profesionales p cross join servicios s where p.activo and s.activo;

-- Horario real: todos los días excepto domingo, de 9:30 a 20:30.
-- (dia_semana: 0 = domingo ... 6 = sábado; al no crear fila para el 0,
-- el domingo queda cerrado automáticamente, sin necesidad de bloqueo).
insert into horarios (profesional_id, sede_id, dia_semana, hora_inicio, hora_fin)
select ps.profesional_id, ps.sede_id, dia, '09:30'::time, '20:30'::time
from profesional_sedes ps
cross join (values (1), (2), (3), (4), (5), (6)) as d(dia);

commit;
