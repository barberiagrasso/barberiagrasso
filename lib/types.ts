// Tipos TypeScript que reflejan el esquema de supabase/schema.sql.
// Mantén esto sincronizado si añades columnas a las tablas.

export interface Sede {
  id: string;
  nombre: string;
  slug: string;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
  // Enlace directo a la ficha de Google Maps de la sede (opcional).
  maps_url?: string | null;
}

export interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_minutos: number;
  precio_centimos: number;
  activo: boolean;
  // null = uno de los 4 servicios "principales" que se muestran
  // directamente en el paso de reserva; si tiene valor, el servicio vive
  // dentro de ese desplegable (ver CATEGORIAS_ORDEN en BookingFlow.tsx).
  categoria?: string | null;
  // Orden dentro de su grupo (los 4 principales entre sí, o los
  // servicios de un mismo desplegable entre sí).
  orden?: number;
  // Color (hex) con el que se pinta este servicio en la leyenda y en las
  // citas de la Agenda — ver lib/coloresServicio.ts.
  color?: string | null;
  // true = precio_centimos es solo un mínimo orientativo ("Rastas",
  // tintes...): se muestra como "Desde X€" en vez de un precio fijo (ver
  // BookingFlow.tsx). No cambia ningún cálculo — el barbero sigue
  // pudiendo corregir el precio final a mano al cerrar la cita, igual
  // que con cualquier otro servicio.
  precio_variable?: boolean;
}

export interface Profesional {
  id: string;
  nombre: string;
  activo: boolean;
  // Foto de perfil (Supabase Storage, bucket público "fotos-profesionales").
  // null = no ha subido ninguna todavía → se muestra el logo por defecto
  // (ver AvatarProfesional en components/brand/).
  foto_url?: string | null;
}

export interface Horario {
  id: string;
  profesional_id: string;
  sede_id: string;
  dia_semana: number; // 0 = domingo ... 6 = sábado
  hora_inicio: string; // "HH:mm:ss"
  hora_fin: string; // "HH:mm:ss"
  // Descanso para comer, regla general de ese día de la semana. NULL =
  // sin descanso fijo ese día. Ver lib/availability.ts (se trata como un
  // hueco ocupado más al calcular disponibilidad) y
  // descansos_excepciones (para mover el descanso un día puntual sin
  // tocar esta regla general).
  descanso_inicio?: string | null;
  descanso_fin?: string | null;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  sede_habitual_id: string | null;
  etiquetas: string[];
  notas: string | null;
  created_at: string;
}

export type TipoConsentimiento = "operativo" | "comercial";
export type CanalConsentimiento = "app" | "whatsapp" | "panel";

export interface Consentimiento {
  id: string;
  cliente_id: string;
  tipo: TipoConsentimiento;
  canal: CanalConsentimiento;
  texto_aceptado: string;
  estado: "activo" | "revocado";
  created_at: string;
}

export type EstadoCita = "confirmada" | "cancelada" | "completada" | "no_presentada";
// "lista_espera": la crea sola el sistema al asignar automáticamente un
// hueco liberado a quien estaba apuntado — ver asignarListaEsperaPorHueco
// en lib/booking.ts. Faltaba en esta unión desde que se añadió esa
// funcionalidad (el valor ya está permitido en la base de datos).
export type OrigenCita = "app" | "panel" | "whatsapp" | "lista_espera";

export interface Cita {
  id: string;
  cliente_id: string;
  sede_id: string;
  profesional_id: string | null;
  servicio_id: string;
  inicio: string; // ISO timestamptz
  fin: string; // ISO timestamptz
  estado: EstadoCita;
  origen: OrigenCita;
  notas: string | null;
  // Se rellena cuando /api/cron/recordatorios ya mandó el recordatorio
  // automático de esta cita (evita mandarlo dos veces).
  recordatorio_enviado_at?: string | null;
  // true si el cliente pidió expresamente este profesional al reservar
  // (no "Cualquiera") — controla el icono de corazón de la Agenda
  // (CalendarioDia.tsx).
  profesional_elegido_por_cliente?: boolean;
  // Se rellenan al cerrar la cita desde el checkout de "Finalizar cita"
  // (ver lib/precios.ts) — null/undefined en cualquier cita todavía no
  // completada, o completada antes de que existiera este campo.
  metodo_pago?: string | null;
  precio_final_centimos?: number | null;
  // Se rellena en el checkout de "Finalizar cita" junto con
  // metodo_pago/precio_final_centimos — momento exacto en que se cobró
  // (distinto de `inicio`, la hora de la cita). Citas completadas antes
  // de este campo se quedan con null.
  pagado_at?: string | null;
  // Anular y archivar un recibo (pedido de Diego, 25/09/2026): deja de
  // contar en facturación/comisiones pero no borra la cita ni su
  // historial — ver lib/recibo.ts. null/undefined = recibo activo.
  recibo_anulado_at?: string | null;
  recibo_anulado_por?: string | null;
  recibo_anulado_motivo?: string | null;
  created_at: string;
}

export interface CitaExtra {
  id: string;
  cita_id: string;
  servicio_id: string;
  precio_centimos: number;
  duracion_minutos: number;
}

export interface CitaConDetalle extends Cita {
  cliente?: Cliente;
  sede?: Sede;
  profesional?: Profesional | null;
  servicio?: Servicio;
  extras?: (CitaExtra & { servicio?: Servicio })[];
}

export type TipoPlantilla = "recordatorio" | "campana";

export interface PlantillaWhatsapp {
  id: string;
  tipo: TipoPlantilla;
  nombre: string;
  nombre_meta: string;
  idioma: string;
  variables: string[];
  activa: boolean;
}

export type EstadoCampana = "borrador" | "enviando" | "enviada" | "fallida";

export interface SegmentoCampana {
  sedeHabitualId?: string | null;
  etiqueta?: string | null;
  soloConsentimientoComercial?: boolean;
  sinVisitasDesde?: string | null; // YYYY-MM-DD: sin citas completadas desde esta fecha
}

export interface Campana {
  id: string;
  nombre: string;
  canal: "whatsapp" | "email" | "push";
  mensaje: string;
  segmento: SegmentoCampana | null;
  plantilla_id: string | null;
  estado: EstadoCampana;
  enviada_at: string | null;
  created_at: string;
}

export interface CampanaDestinatario {
  campana_id: string;
  cliente_id: string;
  estado: "pendiente" | "enviado" | "fallido";
  enviado_at: string | null;
  error: string | null;
}

export interface FranjaDisponible {
  hora_inicio: string; // ISO timestamptz en UTC
  profesional_id: string;
  profesional_nombre: string;
}

export type NivelDisponibilidad = "alta" | "media" | "baja" | "ninguna";

export interface ResumenDiaDisponibilidad {
  fecha: string; // "YYYY-MM-DD" en la zona horaria del negocio
  huecos: number; // nº de horas distintas con al menos un profesional libre
  nivel: NivelDisponibilidad;
  // false si el negocio está cerrado ese día (sin horario) o no queda
  // ningún hueco libre — el calendario no debe dejar seleccionarlo.
  seleccionable: boolean;
}

export interface Conversacion {
  id: string;
  cliente_id: string | null;
  telefono: string;
  estado: "ia" | "escalada" | "cerrada";
  created_at: string;
  updated_at: string;
}

export interface Mensaje {
  id: string;
  conversacion_id: string;
  remitente: "cliente" | "ia" | "gestor";
  contenido: string;
  created_at: string;
}
