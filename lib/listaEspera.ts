// Lógica pura de la lista de espera con reserva automática: aritmética de
// fechas ("YYYY-MM-DD") y la comprobación de si un día que se ha
// liberado cae dentro del margen de flexibilidad que pidió un cliente.
// Separada del resto (lib/booking.ts, que sí toca la base de datos y
// manda WhatsApp) para poder probarla con tests unitarios.

// Márgenes de flexibilidad que puede elegir un cliente al apuntarse:
// exactamente ese día, o hasta 1 o 2 días antes/después — decisión de
// Diego (17/09/2026).
export const FLEXIBILIDADES_VALIDAS = [0, 1, 2] as const;
export type FlexibilidadDias = (typeof FLEXIBILIDADES_VALIDAS)[number];

export function esFlexibilidadValida(valor: unknown): valor is FlexibilidadDias {
  return typeof valor === "number" && (FLEXIBILIDADES_VALIDAS as readonly number[]).includes(valor);
}

/** Suma (o resta, con un número negativo) días a una fecha "YYYY-MM-DD".
 * Mediodía UTC para no arrastrar ningún lío de huso horario al cruzar de
 * día (mismo truco que ya usa lib/vacaciones.ts). */
export function sumarDias(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
}

/** Diferencia en días naturales entre dos fechas "YYYY-MM-DD" (a - b). */
export function diferenciaEnDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad, 12);
  const tb = Date.UTC(by, bm - 1, bd, 12);
  return Math.round((ta - tb) / 86400000);
}

/** ¿El día que se acaba de liberar cae dentro del margen de flexibilidad
 * que pidió este candidato de la lista de espera? Por ejemplo, si pidió
 * el día 10 con ±2 días, le vale del 8 al 12 (ambos inclusive). */
export function fechaDentroDeFlexibilidad(fechaPedida: string, fechaLiberada: string, flexibilidadDias: number): boolean {
  return Math.abs(diferenciaEnDias(fechaLiberada, fechaPedida)) <= flexibilidadDias;
}

/** Texto para mostrarle al cliente qué margen ha elegido. */
export function etiquetaFlexibilidad(flexibilidadDias: number): string {
  if (flexibilidadDias <= 0) return "solo ese día exacto";
  return `ese día, o hasta ${flexibilidadDias} día${flexibilidadDias === 1 ? "" : "s"} antes o después`;
}
