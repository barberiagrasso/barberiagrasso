-- Accesos individuales para el equipo (cada barbero con su propio
-- usuario y contraseña), con permisos reducidos frente a tu cuenta.
--
-- Hasta ahora, cualquier fila en `admins` daba acceso a TODO el panel:
-- no había ningún concepto de rol. Esto añade un rol por cuenta, la
-- posibilidad de forzar el cambio de contraseña en el primer inicio de
-- sesión, y un usuario sencillo (no un email) para las cuentas de
-- equipo, igual que el teléfono es el identificador real de un cliente
-- aunque por debajo Supabase Auth necesite algo con forma de email (ver
-- emailSinteticoParaTelefono en lib/clientes.ts — aquí es el mismo
-- patrón, con `lib/usuarioEquipo.ts`). Reejecutable sin errores.

alter table admins add column if not exists usuario text unique;
alter table admins add column if not exists rol text not null default 'admin' check (rol in ('admin', 'barbero'));
alter table admins add column if not exists profesional_id uuid references profesionales(id) on delete set null;
alter table admins add column if not exists debe_cambiar_password boolean not null default false;

comment on column admins.usuario is 'Usuario sencillo de login para cuentas de equipo (rol barbero). Tu cuenta (rol admin) sigue entrando con tu email real.';
comment on column admins.rol is 'admin: acceso a todo el panel (tú). barbero: todo excepto Equipo, Campañas, Plantillas e Informes.';
comment on column admins.profesional_id is 'A qué ficha de profesionales corresponde esta cuenta de equipo (null para tu cuenta admin).';
comment on column admins.debe_cambiar_password is 'Si es true, el panel obliga a cambiar la contraseña antes de dejar entrar a ninguna otra pantalla.';
