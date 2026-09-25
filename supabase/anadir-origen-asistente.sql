-- citas.origen admite ahora 'app_asistente', para distinguir en los
-- informes por canal (SeccionIngresos/SeccionNoShows) las citas que el
-- cliente aceptó desde la propuesta de la IA (pantalla "¿Qué deseas?" en
-- app/reservar, ver lib/asistenteReserva.ts) de las que eligió a mano
-- paso a paso ('app').
alter table citas drop constraint citas_origen_check;
alter table citas add constraint citas_origen_check check (origen in ('app', 'app_asistente', 'panel', 'whatsapp', 'lista_espera'));
