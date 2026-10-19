-- Checklist de "normas y servicios del local" por sede (tarjetas,
-- accesibilidad, wifi, apto para niños), inspirado en la ficha de
-- negocio de Booksy — pedido de Diego 19/10/2026 tras comparar ambas
-- apps. Configurable desde /admin/mi-barberia (pestaña "Sedes") y
-- visible para el cliente en el paso "Elige tu sede" de /reservar.
alter table sedes
  add column if not exists acepta_tarjeta boolean not null default true,
  add column if not exists acceso_movilidad_reducida boolean not null default false,
  add column if not exists wifi boolean not null default false,
  add column if not exists apto_ninos boolean not null default false;
