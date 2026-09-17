// Lógica pura del sistema de vacaciones (solicitud + aprobación): si dos
// rangos de fechas se solapan, y qué color le toca a cada barbero en el
// calendario agregado del admin. Separada del resto para poder probarla
// con tests unitarios sin necesitar Supabase.

export interface RangoFechas {
  inicio: string; // "YYYY-MM-DD"
  fin: string; // "YYYY-MM-DD"
}

/** Dos rangos de fechas (inclusive por ambos lados, como fecha_inicio /
 * fecha_fin en solicitudes_vacaciones) se solapan si ninguno termina
 * antes de que empiece el otro. */
export function seSolapanRangos(a: RangoFechas, b: RangoFechas): boolean {
  return a.inicio <= b.fin && b.inicio <= a.fin;
}

// Paleta fija para pintar cada barbero con un color distinto y estable
// en el calendario agregado del admin (no depende de cuántos haya ni del
// orden en que lleguen de la base de datos). Con más barberos que
// colores, se repiten — con 7-8 profesionales activos hoy no pasa, y
// aunque pase, dos colores repetidos siguen siendo mejor que sin color.
const PALETA_COLORES = [
  { bg: "bg-blue-500", claro: "bg-blue-100 text-blue-800 border-blue-300" },
  { bg: "bg-emerald-500", claro: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { bg: "bg-purple-500", claro: "bg-purple-100 text-purple-800 border-purple-300" },
  { bg: "bg-orange-500", claro: "bg-orange-100 text-orange-800 border-orange-300" },
  { bg: "bg-pink-500", claro: "bg-pink-100 text-pink-800 border-pink-300" },
  { bg: "bg-cyan-500", claro: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  { bg: "bg-lime-600", claro: "bg-lime-100 text-lime-800 border-lime-300" },
  { bg: "bg-fuchsia-500", claro: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" },
];

/** Color estable para un barbero según su posición en la lista completa
 * de profesionales (ordenada siempre igual, p. ej. por nombre) — así el
 * mismo barbero se pinta siempre igual entre recargas. */
export function colorDeProfesional(profesionalId: string, ordenProfesionales: string[]): { bg: string; claro: string } {
  const indice = ordenProfesionales.indexOf(profesionalId);
  const paleta = PALETA_COLORES[(indice >= 0 ? indice : 0) % PALETA_COLORES.length];
  return paleta;
}

/** Todas las fechas "YYYY-MM-DD" cubiertas por un rango, inclusive. Solo
 * para calendarios de un mes (no pensada para rangos de años). */
export function fechasDelRango({ inicio, fin }: RangoFechas): string[] {
  const resultado: string[] = [];
  let cursor = inicio;
  let guardaInfinita = 0;
  while (cursor <= fin && guardaInfinita < 3660) {
    resultado.push(cursor);
    cursor = sumarUnDia(cursor);
    guardaInfinita++;
  }
  return resultado;
}

function sumarUnDia(fechaYMD: string): string {
  const [anio, mes, dia] = fechaYMD.split("-").map(Number);
  // Mediodía UTC, para no tener ningún riesgo de cambio de día por huso
  // horario (el mismo truco que ya se usa en el resto del proyecto).
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
}
