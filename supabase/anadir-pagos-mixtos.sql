-- Permite pagar una cita con más de un método a la vez, repartido en
-- porcentajes (p. ej. 80% efectivo, 20% tarjeta) — pedido de Diego
-- (20/09/2026). citas.metodo_pago sigue siendo el campo de siempre para
-- el caso normal (un único método): cuando el barbero elige más de uno
-- en el checkout se guarda 'mixto' ahí (para que el aviso "$ pagada" de
-- la Agenda siga funcionando sin tocar nada) y el reparto real, con el
-- importe exacto de cada uno, se guarda en la tabla nueva de abajo.
alter table citas drop constraint citas_metodo_pago_valido;
alter table citas add constraint citas_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('efectivo', 'tarjeta', 'bizum', 'bono', 'otro', 'mixto'));

create table if not exists cita_pagos (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references citas(id) on delete cascade,
  -- "bono" no entra aquí: vender o canjear un bono es un modo de pago
  -- exclusivo aparte (ver FinalizarCitaModal.tsx), no se combina con un
  -- reparto porcentual de efectivo/tarjeta/bizum/otro.
  metodo text not null check (metodo in ('efectivo', 'tarjeta', 'bizum', 'otro')),
  porcentaje numeric not null check (porcentaje > 0 and porcentaje <= 100),
  importe_centimos integer not null check (importe_centimos >= 0),
  created_at timestamptz not null default now()
);
create index if not exists cita_pagos_cita_id_idx on cita_pagos (cita_id);

comment on table cita_pagos is 'Reparto porcentual entre métodos de pago cuando una cita se cobra con más de uno a la vez (ver metodo_pago = ''mixto'' en citas). Si se pagó con un único método, esta tabla no tiene filas para esa cita — el método ya está en citas.metodo_pago.';

alter table cita_pagos enable row level security;
create policy cita_pagos_admin_all on cita_pagos for all using (is_admin()) with check (is_admin());
