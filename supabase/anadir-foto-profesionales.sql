-- =====================================================================
-- Foto de perfil de cada barbero (pedido de Diego, 19/09/2026): debe
-- aparecer allí donde se muestra su nombre — Agenda, selector de barbero
-- al reservar, historial de citas del cliente, Equipo, Comisiones,
-- Vacaciones, Lista de espera... (ver AvatarProfesional en
-- components/brand/). Por defecto ninguno tiene foto (foto_url null) y se
-- muestra el logo de la barbería sobre fondo negro; el propio barbero
-- puede subir la suya desde /admin/mi-perfil (ver
-- app/api/admin/mi-perfil/foto/route.ts).
alter table profesionales add column if not exists foto_url text;

-- Bucket público de Storage para las fotos: son retratos de cara al
-- público (igual que el nombre del barbero, que ya es público en la app),
-- así que se sirven por URL pública sin necesidad de firmar nada. Cada
-- subida usa un nombre de archivo nuevo (con timestamp, ver la ruta de
-- subida) para que el cambio de foto se note al instante sin problemas de
-- caché del navegador — los ficheros antiguos quedan huérfanos, pero
-- pesan poco y no merece la pena la complejidad de borrarlos ahora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-profesionales', 'fotos-profesionales', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lectura pública del bucket (redundante con public=true, pero explícito).
-- La escritura NUNCA pasa por aquí: siempre se hace desde el servidor con
-- el cliente de service role (se salta RLS), después de que
-- app/api/admin/mi-perfil/foto/route.ts compruebe que el barbero solo
-- pueda tocar su propia foto (o un admin, la de cualquiera).
drop policy if exists "fotos_profesionales_lectura_publica" on storage.objects;
create policy "fotos_profesionales_lectura_publica" on storage.objects
  for select using (bucket_id = 'fotos-profesionales');
