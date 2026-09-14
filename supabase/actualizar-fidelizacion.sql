-- Programa de fidelización: saldo acumulable y canjeable.
--
-- Cada cliente acumula un 10% (ver PORCENTAJE_FIDELIZACION en
-- lib/fidelizacion.ts) de lo que gasta en cada cita — cuando esa cita se
-- marca como "completada" desde el panel, nunca antes, para no dar saldo
-- por citas que luego no se presenten o se cancelen. Ese saldo se puede
-- canjear en una reserva futura si cubre el total de la cita (no se
-- puede descontar solo una parte). Si una cita pagada con saldo se
-- cancela o se marca "no presentada", el saldo canjeado se devuelve
-- íntegramente al cliente.
--
-- Todo movimiento de saldo (acumulación, canje, reembolso o ajuste manual
-- de un barbero desde /admin/clientes) pasa por la función
-- registrar_movimiento_saldo(), que actualiza clientes.saldo_fidelizacion_centimos
-- y deja constancia en saldo_fidelizacion_movimientos en la misma
-- transacción — así el saldo de la ficha del cliente y su histórico
-- nunca pueden quedar descuadrados entre sí.
--
-- Re-ejecutable: puedes pegar este archivo en el SQL Editor de Supabase
-- las veces que haga falta sin que rompa nada si ya lo tienes aplicado.

alter table clientes
  add column if not exists saldo_fidelizacion_centimos int not null default 0;

alter table citas
  add column if not exists saldo_canjeado_centimos int not null default 0;

create table if not exists saldo_fidelizacion_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  -- Solo se rellena cuando el movimiento viene de una cita concreta
  -- (acumulación, canje o reembolso). Los ajustes manuales de un barbero
  -- no van ligados a ninguna cita.
  cita_id uuid references citas(id) on delete set null,
  tipo text not null check (tipo in ('acumulacion', 'canje', 'reembolso', 'ajuste_manual')),
  -- Positivo = se suma al saldo (acumulación, reembolso, ajuste a favor).
  -- Negativo = se resta (canje, ajuste en contra).
  importe_centimos int not null,
  -- "Foto" del saldo del cliente justo después de este movimiento, para
  -- poder enseñar el histórico sin tener que recalcularlo sumando filas.
  saldo_resultante_centimos int not null,
  nota text,
  -- 'sistema' para movimientos automáticos; el nombre del barbero para un
  -- ajuste manual desde el panel.
  creado_por text not null default 'sistema',
  created_at timestamptz not null default now()
);

alter table saldo_fidelizacion_movimientos enable row level security;

create index if not exists saldo_movimientos_cliente_idx
  on saldo_fidelizacion_movimientos (cliente_id, created_at desc);

-- Cinturón de seguridad definitivo contra doble acumulación o doble
-- reembolso de la misma cita (p. ej. si el panel manda el PATCH dos
-- veces por un doble clic, o una carrera entre dos peticiones): a nivel
-- de base de datos, cada cita solo puede tener UN movimiento de cada
-- uno de estos tres tipos. Los ajustes manuales quedan fuera de esta
-- restricción porque no van ligados a una cita.
create unique index if not exists saldo_movimientos_cita_tipo_unico_idx
  on saldo_fidelizacion_movimientos (cita_id, tipo)
  where cita_id is not null and tipo in ('acumulacion', 'canje', 'reembolso');

comment on table saldo_fidelizacion_movimientos is
  'Histórico de movimientos del saldo de fidelización de cada cliente. Solo se usa desde el servidor (con la service role) a través de registrar_movimiento_saldo(), por eso no tiene políticas de RLS propias.';

-- Único punto de escritura del saldo de un cliente: bloquea su fila
-- mientras calcula el nuevo saldo (para que dos movimientos casi
-- simultáneos del mismo cliente no se pisen), lo actualiza y deja
-- constancia en saldo_fidelizacion_movimientos dentro de la misma
-- transacción. Si algo falla a mitad (por ejemplo, el índice único de
-- arriba salta porque esta cita ya tenía un movimiento de este tipo),
-- Postgres deshace también la actualización del saldo: nunca queda un
-- saldo cambiado sin su apunte correspondiente, ni al revés.
create or replace function registrar_movimiento_saldo(
  p_cliente_id uuid,
  p_cita_id uuid,
  p_tipo text,
  p_importe_centimos int,
  p_nota text default null,
  p_creado_por text default 'sistema'
) returns int
language plpgsql
as $$
declare
  v_saldo_actual int;
  v_nuevo_saldo int;
begin
  if p_tipo not in ('acumulacion', 'canje', 'reembolso', 'ajuste_manual') then
    raise exception 'Tipo de movimiento de saldo no válido: %', p_tipo;
  end if;

  select saldo_fidelizacion_centimos into v_saldo_actual
  from clientes
  where id = p_cliente_id
  for update;

  if v_saldo_actual is null then
    raise exception 'Cliente % no encontrado', p_cliente_id;
  end if;

  v_nuevo_saldo := v_saldo_actual + p_importe_centimos;

  if v_nuevo_saldo < 0 then
    raise exception 'Saldo insuficiente para este movimiento (saldo actual % + importe %)', v_saldo_actual, p_importe_centimos;
  end if;

  update clientes set saldo_fidelizacion_centimos = v_nuevo_saldo where id = p_cliente_id;

  insert into saldo_fidelizacion_movimientos
    (cliente_id, cita_id, tipo, importe_centimos, saldo_resultante_centimos, nota, creado_por)
  values
    (p_cliente_id, p_cita_id, p_tipo, p_importe_centimos, v_nuevo_saldo, p_nota, coalesce(p_creado_por, 'sistema'));

  return v_nuevo_saldo;
end;
$$;
