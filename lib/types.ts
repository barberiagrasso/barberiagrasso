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
}

export interface Profesional {
  id: string;
  nombre: string;
  activo: boolean;
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
export type OrigenCita = "app" | "panel" | "whatsapp";

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
  created_at: string;
}

export interface CitaConDetalle extends Cita {
  cliente?: Cliente;
  sede?: Sede;
  profesional?: Profesional | null;
  servicio?: Servicio;
}

export interface FranjaDisponible {
  hora_inicio: string; // ISO timestamptz en UTC
  profesional_id: string;
  profesional_nombre: string;
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
