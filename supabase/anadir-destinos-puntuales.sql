-- =====================================================================
-- Destinos puntuales: reasignación de sede de UN DÍA CONCRETO para un
-- profesional multi-sede (caso real: Juan trabaja por defecto en
-- Avenida de las Ciudades, pero algunos días puntuales se le destina a
-- Los Molinos — decisión de Diego, 19/09/2026).
-- =====================================================================
-- No se usa "profesional_sedes" (asignación permanente, como la de
-- David en ambas sedes) porque un destino puntual es justo lo
-- contrario: algo excepcional de un día suelto, que no debe tocar el
-- horario habitual del profesional ni obligar a reconfigurar nada cada
-- vez que termina. Tampoco se reutiliza "bloqueos" (esa tabla dice
-- dónde NO puede atender, no dónde atiende en su lugar).
--
-- Cada fila dice: "el <fecha>, <profesional_id> trabaja en <sede_id>
-- de <hora_inicio> a <hora_fin>, en vez de en su sede habitual". Un
-- profesional no puede tener más de un destino puntual el mismo día
-- (unique). lib/availability.ts (resolverCandidatosConDestinosPuntuales)
-- es quien interpreta esto: ese día, el profesional deja de contar
-- como candidato en su sede habitual y pasa a contarlo en la sede de
-- destino, con este turno en vez del suyo normal.
create table destinos_puntuales (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales(id) on delete cascade,
  fecha date not null,
  sede_id uuid not null references sedes(id) on delete cascade,
  hora_inicio time not null,
  hora_fin time not null,
  notas text,
  creado_por uuid references admins(id),
  created_at timestamptz not null default now(),
  unique (profesional_id, fecha),
  check (hora_fin > hora_inicio)
);

create index destinos_puntuales_fecha_idx on destinos_puntuales (fecha);
create index destinos_puntuales_sede_fecha_idx on destinos_puntuales (sede_id, fecha);

alter table destinos_puntuales enable row level security;

-- Como el resto de RLS de este proyecto: solo defensa en profundidad
-- (las rutas /api/admin/... usan la service role key, que no pasa por
-- RLS). Solo el admin gestiona destinos puntuales desde el panel.
create policy "destinos_puntuales_admin_all" on destinos_puntuales for all using (is_admin()) with check (is_admin());
