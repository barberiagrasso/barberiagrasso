-- Valoraciones con estrellas de citas completadas (Diego pidió copiar
-- lo que vio en Booksy, 19/10/2026): el cliente puntúa de 1 a 5 y deja
-- un comentario opcional desde /perfil una vez su cita pasa a
-- "completada". Una sola valoración por cita (constraint unique), no se
-- puede duplicar ni editar desde aquí una vez enviada.
create table resenas (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null unique references citas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  profesional_id uuid references profesionales(id) on delete set null,
  sede_id uuid references sedes(id) on delete set null,
  estrellas smallint not null check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

create index resenas_profesional_id_idx on resenas(profesional_id);
create index resenas_sede_id_idx on resenas(sede_id);
create index resenas_cliente_id_idx on resenas(cliente_id);

alter table resenas enable row level security;
create policy "resenas_admin_all" on resenas for all using (is_admin()) with check (is_admin());
