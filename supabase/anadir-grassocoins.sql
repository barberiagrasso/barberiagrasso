-- GrassoCoins: puntos de la tarjeta de fidelidad (24/10/2026).
--
-- Sustituye al saldo en euros (10 % de lo gastado) por puntos:
--   * Se gana 1 GrassoCoin por cada euro pagado (EUROS_POR_GRASSOCOIN en
--     lib/grassocoins.ts; el servidor le pasa la regla a la función). Los
--     céntimos que sobran no se pierden: se guardan en
--     clientes.grassocoins_resto_centimos y cuentan para la siguiente visita
--     (12,80 € → 12 coins y 0,80 € guardados).
--   * Se ganan al COBRAR la cita en el panel, nunca antes, sobre lo que el
--     cliente paga de verdad: servicio y extras (precio en efectivo,
--     descuento o precio del bono si lo compra) y productos.
--   * Se canjean por servicios: cada servicio tiene un precio en coins
--     (servicios.coste_grassocoins, lo pones tú en el panel → Servicios;
--     vacío = no se puede canjear). Canjear cubre la cita entera, así que
--     el servicio y cada extra elegido tienen que tener precio en coins.
--   * Si una cita canjeada se cancela o no se presenta, se devuelven las
--     coins íntegras.
--   * Todos los clientes empiezan con 0 coins (decisión de Diego): el saldo
--     antiguo en euros deja de usarse y no se convierte.
--
-- Igual que el saldo antiguo, todo movimiento pasa por una única función,
-- registrar_movimiento_grassocoins(), que actualiza el cliente y deja
-- constancia en grassocoins_movimientos en la misma transacción.
--
-- Re-ejecutable: se puede pegar en el SQL Editor de Supabase las veces que
-- haga falta.

alter table clientes
  add column if not exists grassocoins int not null default 0,
  add column if not exists grassocoins_resto_centimos int not null default 0;

alter table servicios
  add column if not exists coste_grassocoins int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_coste_grassocoins_positivo') then
    alter table servicios
      add constraint servicios_coste_grassocoins_positivo check (coste_grassocoins is null or coste_grassocoins > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_grassocoins_no_negativo') then
    alter table clientes
      add constraint clientes_grassocoins_no_negativo check (grassocoins >= 0 and grassocoins_resto_centimos >= 0);
  end if;
end $$;

alter table citas
  add column if not exists grassocoins_canjeados int not null default 0;

create table if not exists grassocoins_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  -- Solo para movimientos de una cita concreta (acumulación, canje o
  -- reembolso). Los ajustes manuales no van ligados a ninguna cita.
  cita_id uuid references citas(id) on delete set null,
  tipo text not null check (tipo in ('acumulacion', 'canje', 'reembolso', 'ajuste_manual')),
  -- Positivo = coins que se suman; negativo = coins que se restan.
  coins int not null,
  -- Solo en acumulaciones: euros (en céntimos) pagados en esa cita que se
  -- tuvieron en cuenta para calcular las coins.
  gasto_centimos int,
  -- "Foto" del cliente justo después del movimiento, para enseñar el
  -- histórico sin recalcular.
  coins_resultantes int not null,
  resto_resultante_centimos int not null,
  nota text,
  creado_por text not null default 'sistema',
  created_at timestamptz not null default now()
);

alter table grassocoins_movimientos enable row level security;

create index if not exists grassocoins_movimientos_cliente_idx
  on grassocoins_movimientos (cliente_id, created_at desc);

-- Cada cita solo puede tener UN movimiento de cada tipo automático: evita
-- dar coins dos veces por un doble clic al cobrar, o devolverlas dos veces.
create unique index if not exists grassocoins_movimientos_cita_tipo_unico_idx
  on grassocoins_movimientos (cita_id, tipo)
  where cita_id is not null and tipo in ('acumulacion', 'canje', 'reembolso');

comment on table grassocoins_movimientos is
  'Histórico de GrassoCoins de cada cliente. Solo se escribe desde el servidor (service role) a través de registrar_movimiento_grassocoins(); por eso no tiene políticas de RLS propias.';

-- Único punto de escritura de las GrassoCoins de un cliente. Bloquea su
-- fila mientras calcula (dos movimientos casi simultáneos no se pisan),
-- actualiza y apunta el movimiento en la misma transacción.
--   acumulacion: p_gasto_centimos = lo pagado; las coins las calcula aquí
--                sumando el resto guardado (p_coins se ignora).
--   canje:       p_coins = coins a gastar (en positivo o negativo, da igual).
--   reembolso:   p_coins = coins a devolver.
--   ajuste_manual: p_coins positivo o negativo.
-- Devuelve las coins del cliente después del movimiento.
create or replace function registrar_movimiento_grassocoins(
  p_cliente_id uuid,
  p_cita_id uuid,
  p_tipo text,
  p_coins int default 0,
  p_gasto_centimos int default null,
  p_euros_por_coin_centimos int default 100,
  p_nota text default null,
  p_creado_por text default 'sistema'
) returns int
language plpgsql
as $$
declare
  v_coins int;
  v_resto int;
  v_delta int;
  v_total int;
begin
  if p_tipo not in ('acumulacion', 'canje', 'reembolso', 'ajuste_manual') then
    raise exception 'Tipo de movimiento de GrassoCoins no válido: %', p_tipo;
  end if;

  select grassocoins, grassocoins_resto_centimos into v_coins, v_resto
  from clientes
  where id = p_cliente_id
  for update;

  if v_coins is null then
    raise exception 'Cliente % no encontrado', p_cliente_id;
  end if;

  if p_tipo = 'acumulacion' then
    if coalesce(p_gasto_centimos, 0) <= 0 or coalesce(p_euros_por_coin_centimos, 0) <= 0 then
      raise exception 'Acumulación de GrassoCoins sin importe válido';
    end if;
    v_total := v_resto + p_gasto_centimos;
    v_delta := v_total / p_euros_por_coin_centimos;
    v_resto := v_total % p_euros_por_coin_centimos;
  elsif p_tipo = 'canje' then
    v_delta := -abs(p_coins);
  elsif p_tipo = 'reembolso' then
    v_delta := abs(p_coins);
  else
    v_delta := p_coins;
  end if;

  if v_coins + v_delta < 0 then
    raise exception 'GrassoCoins insuficientes (tiene %, movimiento %)', v_coins, v_delta;
  end if;
  v_coins := v_coins + v_delta;

  update clientes
  set grassocoins = v_coins, grassocoins_resto_centimos = v_resto
  where id = p_cliente_id;

  insert into grassocoins_movimientos
    (cliente_id, cita_id, tipo, coins, gasto_centimos, coins_resultantes, resto_resultante_centimos, nota, creado_por)
  values
    (p_cliente_id, p_cita_id, p_tipo, v_delta, case when p_tipo = 'acumulacion' then p_gasto_centimos end,
     v_coins, v_resto, p_nota, coalesce(p_creado_por, 'sistema'));

  return v_coins;
end;
$$;

-- Solo el servidor (service role) puede mover coins: nadie desde el
-- navegador puede llamar a la función directamente.
revoke all on function registrar_movimiento_grassocoins(uuid, uuid, text, int, int, int, text, text) from public, anon, authenticated;
grant execute on function registrar_movimiento_grassocoins(uuid, uuid, text, int, int, int, text, text) to service_role;
