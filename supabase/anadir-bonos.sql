-- =====================================================================
-- Bonos: paquete de varios usos de un servicio concreto, vendido en el
-- propio establecimiento (nunca desde la app) y pagado de una sola vez.
-- Decisiones de Diego (19/09/2026): vale en cualquiera de las dos sedes,
-- caduca al mes de la compra, 4 usos por bono. Los dos tipos de partida
-- son "Corte" (42€) y "Corte y barba" (55€) — el precio se puede cambiar
-- después desde Mi barbería → Bonos, sin tocar los bonos ya vendidos
-- (bonos.precio_pagado_centimos guarda una "foto" del precio pagado,
-- igual que cita_extras con los complementos).
-- =====================================================================

create table bonos_tipos (
  id uuid primary key default gen_random_uuid(),
  -- Clave estable para el código (no se edita desde el panel); "nombre"
  -- sí es editable si algún día hace falta, aunque hoy coincide con el
  -- nombre del servicio que cubre.
  clave text not null unique check (clave in ('corte', 'corte_y_barba')),
  nombre text not null,
  servicio_id uuid not null references servicios(id),
  precio_centimos int not null check (precio_centimos >= 0),
  usos_totales int not null default 4 check (usos_totales > 0),
  dias_validez int not null default 30 check (dias_validez > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bono ya vendido a un cliente concreto. "usos_restantes" se descuenta al
-- completar cada cita que lo canjea (incluida la propia cita de compra,
-- que consume el primer uso al momento). No se borra ni se oculta al
-- agotarse ni al caducar: se queda tal cual para que el cliente lo siga
-- viendo en su perfil (decisión de Diego).
create table bonos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  bono_tipo_id uuid not null references bonos_tipos(id),
  usos_totales int not null check (usos_totales > 0),
  usos_restantes int not null check (usos_restantes >= 0),
  precio_pagado_centimos int not null check (precio_pagado_centimos >= 0),
  fecha_compra date not null default current_date,
  fecha_caducidad date not null,
  created_at timestamptz not null default now(),
  check (usos_restantes <= usos_totales)
);

create index bonos_cliente_idx on bonos (cliente_id);

-- Qué cita compró o canjeó este bono (una cita consume como mucho un uso
-- de un bono). "on delete set null" porque el bono y su historial de usos
-- deben sobrevivir aunque, en un caso muy raro, se borrase la cita.
alter table citas add column if not exists bono_id uuid references bonos(id) on delete set null;

alter table citas drop constraint if exists citas_metodo_pago_valido;
alter table citas add constraint citas_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('efectivo', 'tarjeta', 'bizum', 'bono', 'otro'));

alter table bonos_tipos enable row level security;
alter table bonos enable row level security;

-- Como el resto de RLS de este proyecto: solo defensa en profundidad
-- (las rutas /api/admin/... usan la service role key, que no pasa por
-- RLS; el perfil del cliente lee sus propios bonos igual, con esa misma
-- clave, después de comprobar la sesión con requireCliente()).
create policy "bonos_tipos_admin_all" on bonos_tipos for all using (is_admin()) with check (is_admin());
create policy "bonos_admin_all" on bonos for all using (is_admin()) with check (is_admin());

insert into bonos_tipos (clave, nombre, servicio_id, precio_centimos, usos_totales, dias_validez)
select 'corte', 'Corte', id, 4200, 4, 30 from servicios where nombre = 'Corte' limit 1;
insert into bonos_tipos (clave, nombre, servicio_id, precio_centimos, usos_totales, dias_validez)
select 'corte_y_barba', 'Corte y barba', id, 5500, 4, 30 from servicios where nombre = 'Corte y barba' limit 1;

-- Único punto de escritura de "usos_restantes": resta un uso de forma
-- atómica (bloqueando la fila mientras decide) para que dos citas del
-- mismo bono cerrándose casi a la vez nunca lo dejen en negativo. Se
-- usa solo al CANJEAR un uso en una cita futura — la cita de compra
-- resta su primer uso directamente al crear el bono (ver comprarBono en
-- lib/bonos.ts), igual que registrar_movimiento_saldo() en
-- actualizar-fidelizacion.sql resuelve lo mismo para el saldo de
-- fidelización.
create or replace function canjear_uso_bono(p_bono_id uuid) returns bonos
language plpgsql
as $$
declare
  v_bono bonos;
begin
  select * into v_bono from bonos where id = p_bono_id for update;

  if v_bono.id is null then
    raise exception 'Bono % no encontrado', p_bono_id;
  end if;

  if v_bono.usos_restantes <= 0 then
    raise exception 'El bono % ya no tiene usos disponibles', p_bono_id;
  end if;

  update bonos set usos_restantes = usos_restantes - 1 where id = p_bono_id
    returning * into v_bono;

  return v_bono;
end;
$$;

-- Contrapartida de canjear_uso_bono(): devuelve un uso, sin pasar nunca
-- de usos_totales. Solo se usa como compensación cuando canjear_uso_bono()
-- ya se ejecutó pero el resto del guardado de la cita falló justo
-- después (ver app/api/admin/citas/[id]/finalizar/route.ts) — un camino
-- de error excepcional, no el flujo normal.
create or replace function devolver_uso_bono(p_bono_id uuid) returns bonos
language plpgsql
as $$
declare
  v_bono bonos;
begin
  update bonos
    set usos_restantes = least(usos_totales, usos_restantes + 1)
    where id = p_bono_id
    returning * into v_bono;

  if v_bono.id is null then
    raise exception 'Bono % no encontrado', p_bono_id;
  end if;

  return v_bono;
end;
$$;
