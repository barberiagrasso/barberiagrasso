-- =====================================================================
-- Barbería Grasso — Cuentas de cliente (login) + historial de citas
-- =====================================================================
-- Ejecuta esto en el SQL Editor de Supabase (New query → pegar → Run).
-- Es seguro volver a ejecutarlo entero si hiciera falta.
--
-- Qué añade:
--   1. Una columna en `clientes` que enlaza la fila del CRM con la
--      cuenta de acceso (Supabase Auth) del propio cliente, cuando se
--      registra en la app con teléfono + contraseña.
--   2. Permiso para que un cliente autenticado pueda leer SU PROPIA
--      fila en `clientes` y SUS PROPIAS citas (para la sección
--      "Mi perfil") — nunca las de otro cliente. Todo lo demás sigue
--      exactamente igual: solo el backend (service role) y los
--      administradores pueden escribir o ver el resto de datos.
-- =====================================================================

begin;

alter table clientes add column if not exists user_id uuid references auth.users(id);
create unique index if not exists clientes_user_id_key on clientes (user_id);

drop policy if exists "clientes_self_read" on clientes;
create policy "clientes_self_read" on clientes for select using (user_id = auth.uid());

drop policy if exists "citas_self_read" on citas;
create policy "citas_self_read" on citas for select using (
  cliente_id in (select id from clientes where user_id = auth.uid())
);

drop policy if exists "cita_extras_self_read" on cita_extras;
create policy "cita_extras_self_read" on cita_extras for select using (
  cita_id in (
    select c.id from citas c
    join clientes cl on cl.id = c.cliente_id
    where cl.user_id = auth.uid()
  )
);

commit;
