-- Auditoría de seguridad (22/11/2026).
--
-- PROBLEMA: is_admin() devolvía "sí" para CUALQUIER cuenta del panel,
-- también las de los barberos. Las políticas de la base de datos
-- ("for all using (is_admin())") dejaban entonces a un barbero, con su
-- usuario y la clave pública de la web, leer, cambiar o BORRAR
-- directamente todas las tablas (clientes con sus teléfonos, citas,
-- comisiones, campañas...), saltándose los permisos de la app.
--
-- ARREGLO: solo cuenta como administrador el dueño (rol 'admin'). La app
-- no se ve afectada: todo lo hace desde el servidor con su propia clave,
-- y la lectura de "mi cuenta" usa otra política (admins_self_read).
--
-- Se puede ejecutar más de una vez sin romper nada.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where id = auth.uid() and rol = 'admin');
$$;
