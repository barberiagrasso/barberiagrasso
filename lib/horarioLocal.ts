// Conversión entre "hora de reloj" en Europe/Madrid y el instante UTC
// (ISO) que se guarda en la base de datos — hace falta porque el barbero
// corrige un horario pensando en la hora que marca el reloj de la
// barbería, sin que tenga que preocuparse de si ese día hay horario de
// verano o no (el desfase con UTC cambia dos veces al año).
//
// Sin "server-only": se usa desde un componente de cliente (el modal de
// finalizar cita), no desde una ruta de servidor.

const ZONA = "Europe/Madrid";

/** "YYYY-MM-DD" de un instante ISO, tal y como se ve en Europe/Madrid. */
export function fechaEnMadrid(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
}

/** "HH:mm" de un instante ISO, tal y como se ve en Europe/Madrid. */
export function horaEnMadrid(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * El instante UTC (como ISO) que corresponde a una fecha + hora de reloj
 * en Europe/Madrid. Calcula el desfase real para ese día concreto (con o
 * sin horario de verano) en vez de asumir uno fijo — así funciona igual
 * de bien un día de enero que uno de julio.
 */
export function isoDesdeMadrid(fechaYMD: string, horaHM: string): string {
  // Primera aproximación: tratar esa fecha+hora como si ya fuera UTC.
  const objetivo = new Date(`${fechaYMD}T${horaHM}:00Z`);

  // ¿Qué hora marca ese instante en Europe/Madrid? La diferencia con la
  // hora deseada ES el desfase real de esa fecha.
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(objetivo);
  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;
  // Algunos entornos formatean la medianoche como "24:00" en vez de "00:00".
  const hora = p.hour === "24" ? "00" : p.hour;
  const marcaEnMadridComoUTC = new Date(`${p.year}-${p.month}-${p.day}T${hora}:${p.minute}:00Z`);

  const desfaseMs = objetivo.getTime() - marcaEnMadridComoUTC.getTime();
  return new Date(objetivo.getTime() + desfaseMs).toISOString();
}

/**
 * Minutos desde medianoche de una hora en formato "HH:mm" o "HH:mm:ss"
 * (como las que guarda Postgres en columnas `time`, p. ej. las de
 * `horarios`). Útil para posicionar algo en un eje vertical de horas
 * (el calendario de la vista de día). No hace ninguna conversión de
 * huso horario: es aritmética pura sobre el texto de la hora.
 */
export function minutosDeHora(horaHMS: string): number {
  const [h, m] = horaHMS.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutos desde medianoche (en Europe/Madrid) de un instante ISO. */
export function minutosEnMadrid(iso: string): number {
  return minutosDeHora(horaEnMadrid(iso));
}
