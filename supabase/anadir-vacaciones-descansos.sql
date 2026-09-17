-- =====================================================================
-- Vacaciones (solicitud + aprobación), días bloqueados para pedir
-- vacaciones, y descanso para comer por barbero
-- =====================================================================
-- Ejecutar una sola vez en Supabase Dashboard → SQL Editor. Añade:
--
-- 1. solicitudes_vacaciones: sustituye el uso de "bloqueos" para
--    vacaciones personales de un barbero. Es una tabla propia (no
--    encaja bien en "bloqueos", que es por sede) porque una vacación es
--    de la PERSONA, no de una sede — el barbero puede trabajar en varias
--    sedes y estar de vacaciones en todas a la vez. Un barbero solo
--    puede crear solicitudes para sí mismo, en estado "pendiente"; solo
--    el rol "admin" puede aprobarlas/rechazarlas (o darlas de alta ya
--    aprobadas directamente, si el barbero avisa por otro medio). No
--    puede haber dos barberos de vacaciones (pendiente o aprobada) el
--    mismo día, sea cual sea su sede — decisión explícita de Diego
--    (17/09/2026) — comprobado en la propia API antes de insertar.
-- 2. dias_bloqueados_vacaciones: días (o periodos) en los que el admin
--    impide que se puedan solicitar vacaciones (p. ej. Navidad, un
--    evento con mucha demanda). No afecta a la reserva de clientes, solo
--    a qué fechas se le dejan pedir a un barbero.
-- 3. horarios.descanso_inicio / descanso_fin: la regla general del
--    descanso para comer de cada barbero, por día de la semana (mismo
--    sitio que ya guarda su turno). Opcional (NULL = sin descanso fijo
--    ese día).
-- 4. descansos_excepciones: cuando el admin mueve el descanso de un
--    barbero un día concreto arrastrándolo en la Agenda — no cambia la
--    regla general, solo ese día. Una fila por barbero+día como mucho.
-- =====================================================================

create table solicitudes_vacaciones (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo text,
  -- Quién la creó: el propio barbero (lo normal) o el admin, si la da de
  -- alta directamente ya aprobada porque el barbero avisó por otro canal.
  solicitado_por uuid references admins(id),
  resuelto_por uuid references admins(id),
  resuelto_en timestamptz,
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index solicitudes_vacaciones_profesional_idx on solicitudes_vacaciones (profesional_id);
create index solicitudes_vacaciones_fechas_idx on solicitudes_vacaciones (fecha_inicio, fecha_fin);

create table dias_bloqueados_vacaciones (
  id uuid primary key default gen_random_uuid(),
  fecha_inicio date not null,
  fecha_fin date not null,
  motivo text,
  creado_por uuid references admins(id),
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index dias_bloqueados_vacaciones_fechas_idx on dias_bloqueados_vacaciones (fecha_inicio, fecha_fin);

alter table horarios
  add column descanso_inicio time,
  add column descanso_fin time,
  add constraint horarios_descanso_completo check ((descanso_inicio is null) = (descanso_fin is null)),
  add constraint horarios_descanso_dentro_turno check (
    descanso_inicio is null or (descanso_inicio >= hora_inicio and descanso_fin <= hora_fin and descanso_fin > descanso_inicio)
  );

create table descansos_excepciones (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profesional_id, fecha),
  check (hora_fin > hora_inicio)
);

alter table solicitudes_vacaciones enable row level security;
alter table dias_bloqueados_vacaciones enable row level security;
alter table descansos_excepciones enable row level security;

-- Como el resto de RLS de este proyecto: solo defensa en profundidad
-- (todas las rutas /api/admin/... usan la service role key, que no pasa
-- por RLS). El control fino de quién puede aprobar/rechazar, bloquear
-- días o mover un descanso vive en el propio código de la ruta
-- (requireRolAdminApi para lo que es solo de admin).
create policy "solicitudes_vacaciones_admin_all" on solicitudes_vacaciones for all using (is_admin()) with check (is_admin());
create policy "dias_bloqueados_vacaciones_admin_all" on dias_bloqueados_vacaciones for all using (is_admin()) with check (is_admin());
create policy "descansos_excepciones_admin_all" on descansos_excepciones for all using (is_admin()) with check (is_admin());
