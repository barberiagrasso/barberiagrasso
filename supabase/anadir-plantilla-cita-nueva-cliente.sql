-- Pedido de Diego (03/10/2026): cuando el panel crea una cita a un
-- cliente que nunca había reservado con nosotros, se le avisa por
-- WhatsApp de la cita y de que se descargue la app (como hacía Booksy).
-- Es un mensaje que inicia el negocio sin que el cliente haya escrito
-- antes, así que hace falta una plantilla aprobada por Meta, igual que
-- "bienvenida" — ver avisarCitaNuevaCliente en
-- app/api/admin/citas/route.ts.
alter table plantillas_whatsapp drop constraint if exists plantillas_whatsapp_tipo_check;
alter table plantillas_whatsapp add constraint plantillas_whatsapp_tipo_check
  check (tipo in ('recordatorio', 'campana', 'retencion_inactivo', 'retencion_cumple', 'recuperacion_password', 'bienvenida', 'cita_nueva_cliente'));
