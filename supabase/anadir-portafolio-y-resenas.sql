-- =====================================================================
-- Portafolio de trabajos y enlaces de reseñas por sede (27/10/2026).
--
-- 1. Portafolio: fotos de trabajos que sube Diego desde el panel
--    (Mi barbería → Portafolio). Cada foto puede ir ligada a un servicio
--    (para el botón "Ver trabajos" de ese servicio al reservar) y a una
--    sede; las dos cosas son opcionales. El cliente las ve en /portafolio.
-- 2. Reseñas externas por sede: la nota y el nº de reseñas de Booksy y de
--    Google, con sus enlaces, para enseñarlas en la app sin copiar las
--    reseñas. De Google también se guarda el enlace para ESCRIBIR una
--    reseña: tras valorar su visita en la app, se invita a TODOS los
--    clientes (sea cual sea su nota) a dejarla también en Google — invitar
--    solo a los de 5 estrellas lo prohíbe Google ("review gating").
--
-- Re-ejecutable: se puede pegar en el SQL Editor de Supabase las veces
-- que haga falta. La app funciona igual antes de ejecutarlo (simplemente
-- no enseña portafolio ni notas hasta que exista).
-- =====================================================================

create table if not exists portafolio_fotos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  -- Ruta dentro del bucket, para poder borrar el archivo al borrar la foto.
  ruta_storage text not null,
  servicio_id uuid references servicios(id) on delete set null,
  sede_id uuid references sedes(id) on delete set null,
  descripcion text,
  created_at timestamptz not null default now()
);

create index if not exists portafolio_fotos_servicio_idx on portafolio_fotos (servicio_id, created_at desc);
create index if not exists portafolio_fotos_creado_idx on portafolio_fotos (created_at desc);

alter table portafolio_fotos enable row level security;
-- Son fotos de cara al público: cualquiera puede verlas. La escritura
-- solo pasa por el servidor (service role) tras comprobar que es Diego.
drop policy if exists "portafolio_fotos_lectura_publica" on portafolio_fotos;
create policy "portafolio_fotos_lectura_publica" on portafolio_fotos for select using (true);

-- Bucket público para las imágenes del portafolio. Las fotos se reducen en
-- el navegador antes de subirlas (máx. ~1600 px), así que 5 MB sobra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portafolio', 'portafolio', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "portafolio_lectura_publica" on storage.objects;
create policy "portafolio_lectura_publica" on storage.objects
  for select using (bucket_id = 'portafolio');

create table if not exists sede_resenas_externas (
  sede_id uuid not null references sedes(id) on delete cascade,
  fuente text not null check (fuente in ('booksy', 'google')),
  -- Página donde se leen las reseñas (perfil de Booksy, ficha de Google Maps).
  url text,
  -- Solo Google: enlace directo para escribir una reseña
  -- (https://g.page/r/.../review o search.google.com/local/writereview?placeid=...).
  url_escribir text,
  nota numeric(2,1) check (nota is null or (nota >= 0 and nota <= 5)),
  total int check (total is null or total >= 0),
  updated_at timestamptz not null default now(),
  primary key (sede_id, fuente)
);

alter table sede_resenas_externas enable row level security;
drop policy if exists "sede_resenas_externas_lectura_publica" on sede_resenas_externas;
create policy "sede_resenas_externas_lectura_publica" on sede_resenas_externas for select using (true);
