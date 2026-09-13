import "server-only";
import { parse, startOfDay, endOfDay, startOfWeek, startOfMonth, format, differenceInCalendarDays, subDays, addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

// Helpers compartidos por las 4 APIs de informes (resumen, ocupación,
// no-shows, clientes): parseo del rango de fechas elegido en el panel,
// cálculo del "periodo anterior" para las comparativas, y agrupación en
// buckets (día/semana/mes) para las series temporales de los gráficos.

export const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

export interface RangoFechas {
  inicioLocal: Date;
  finLocal: Date;
  desdeUTC: Date;
  hastaUTC: Date;
  totalDias: number;
}

export function parseRango(desdeStr: string, hastaStr: string): RangoFechas {
  const inicioLocal = startOfDay(parse(desdeStr, "yyyy-MM-dd", new Date()));
  const finLocal = endOfDay(parse(hastaStr, "yyyy-MM-dd", new Date()));
  const desdeUTC = fromZonedTime(inicioLocal, TZ);
  const hastaUTC = fromZonedTime(finLocal, TZ);
  const totalDias = differenceInCalendarDays(finLocal, inicioLocal) + 1;
  return { inicioLocal, finLocal, desdeUTC, hastaUTC, totalDias };
}

// Mismo número de días, inmediatamente antes del rango actual — la base de
// todas las comparativas "vs. periodo anterior" de los informes.
export function rangoAnterior(rango: RangoFechas): { desdeUTC: Date; hastaUTC: Date } {
  const finAnteriorLocal = subDays(rango.inicioLocal, 1);
  const inicioAnteriorLocal = subDays(finAnteriorLocal, rango.totalDias - 1);
  return {
    desdeUTC: fromZonedTime(startOfDay(inicioAnteriorLocal), TZ),
    hastaUTC: fromZonedTime(endOfDay(finAnteriorLocal), TZ),
  };
}

// Variación porcentual entre dos valores, para las tarjetas de comparación.
// null cuando no hay base sobre la que calcular un porcentaje con sentido.
export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

export type Granularidad = "dia" | "semana" | "mes";

// Por defecto se agrupa por día si el rango es corto, por semana si es
// medio y por mes si es largo — así un gráfico de un año no acaba con 365
// puntos ilegibles.
export function granularidadParaRango(totalDias: number): Granularidad {
  if (totalDias <= 31) return "dia";
  if (totalDias <= 180) return "semana";
  return "mes";
}

// Clave (para agrupar) y etiqueta (para mostrar) del bucket al que
// pertenece un instante ISO, en la zona horaria del negocio.
export function bucketDe(iso: string, granularidad: Granularidad): { clave: string; etiqueta: string } {
  const local = toZonedTime(new Date(iso), TZ);
  if (granularidad === "dia") {
    return { clave: format(local, "yyyy-MM-dd"), etiqueta: format(local, "dd/MM") };
  }
  if (granularidad === "semana") {
    const inicioSemana = startOfWeek(local, { weekStartsOn: 1 });
    return { clave: format(inicioSemana, "yyyy-MM-dd"), etiqueta: `Sem. ${format(inicioSemana, "dd/MM")}` };
  }
  const inicioMes = startOfMonth(local);
  return { clave: format(inicioMes, "yyyy-MM"), etiqueta: format(inicioMes, "MMM yyyy") };
}

// Todos los buckets del rango, en orden, incluso los que acaben sin datos
// — para que una línea de tendencia no tenga huecos donde no pasó nada.
export function generarBuckets(rango: RangoFechas, granularidad: Granularidad): { clave: string; etiqueta: string }[] {
  const buckets: { clave: string; etiqueta: string }[] = [];
  const vistas = new Set<string>();
  let cursor = rango.inicioLocal;
  while (cursor <= rango.finLocal) {
    const b = bucketDe(fromZonedTime(cursor, TZ).toISOString(), granularidad);
    if (!vistas.has(b.clave)) {
      vistas.add(b.clave);
      buckets.push(b);
    }
    cursor = addDays(cursor, 1);
  }
  return buckets;
}
