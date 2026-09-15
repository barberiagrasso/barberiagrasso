// Lógica pura del sistema de comisiones — sin "server-only" a propósito:
// tanto las rutas de servidor (app/api/admin/comisiones/...) como el
// propio panel (para la vista previa en vivo al editar tramos, o el
// aviso "te faltan X€ para subir de tramo") la necesitan.

export interface TramoComision {
  // Rango de facturación mensual, en céntimos, al que se aplica este
  // tramo: [desdeCentimos, hastaCentimos) — el límite inferior es de
  // este tramo, el superior ya es del siguiente. hastaCentimos = null
  // en el tramo más alto ("a partir de X€, sin límite").
  desdeCentimos: number;
  hastaCentimos: number | null;
  // Porcentaje de comisión (0-100, admite decimales) aplicado a TODA la
  // facturación del mes cuando cae en este tramo.
  porcentaje: number;
}

export interface TramoComisionConId extends TramoComision {
  id: string;
}

/**
 * Calcula la comisión de un barbero a partir de su facturación del mes:
 * se identifica en qué tramo cae el TOTAL facturado (no es progresivo
 * por escalones como el IRPF — no se suman "trozos" de distintos
 * tramos) y se aplica ese único porcentaje a toda la facturación. Si la
 * facturación no cae en ningún tramo definido (por ejemplo, por debajo
 * del primero, o en un hueco entre dos tramos), la comisión es 0.
 */
export function calcularComision(
  facturacionCentimos: number,
  tramos: TramoComision[]
): { comisionCentimos: number; tramo: TramoComision | null } {
  const tramoAplicado =
    tramos.find(
      (t) => facturacionCentimos >= t.desdeCentimos && (t.hastaCentimos === null || facturacionCentimos < t.hastaCentimos)
    ) ?? null;
  if (!tramoAplicado) return { comisionCentimos: 0, tramo: null };
  return { comisionCentimos: Math.round((facturacionCentimos * tramoAplicado.porcentaje) / 100), tramo: tramoAplicado };
}

/**
 * El tramo inmediatamente por encima de la facturación actual (el de
 * "desde" más bajo entre los que empiezan por encima de lo ya
 * facturado) — para el aviso "te faltan X€ para subir al Y%" que ve el
 * propio barbero. null si ya está en el tramo más alto o no hay ningún
 * tramo por encima.
 */
export function siguienteTramo(facturacionCentimos: number, tramos: TramoComision[]): TramoComision | null {
  const porEncima = tramos.filter((t) => t.desdeCentimos > facturacionCentimos).sort((a, b) => a.desdeCentimos - b.desdeCentimos);
  return porEncima[0] ?? null;
}

/**
 * Valida una lista de tramos antes de guardarla: importes y porcentajes
 * dentro de rango, límites coherentes, y que ningún tramo se solape con
 * otro (a un mismo euro de facturación no puede corresponderle más de
 * un porcentaje). Los huecos SÍ están permitidos (esa franja,
 * simplemente, no da comisión) — así no hace falta cubrir expresamente
 * el tramo por debajo del primero. Devuelve el mensaje de error (en
 * español, listo para mostrar) o null si la lista es válida.
 */
export function validarTramos(tramos: TramoComision[]): string | null {
  if (tramos.length === 0) return "Añade al menos un tramo.";

  for (const t of tramos) {
    if (!Number.isInteger(t.desdeCentimos) || t.desdeCentimos < 0) {
      return 'El importe "desde" debe ser un número positivo.';
    }
    if (t.hastaCentimos !== null && (!Number.isInteger(t.hastaCentimos) || t.hastaCentimos <= t.desdeCentimos)) {
      return 'El importe "hasta" debe ser mayor que el "desde".';
    }
    if (!Number.isFinite(t.porcentaje) || t.porcentaje < 0 || t.porcentaje > 100) {
      return "El porcentaje debe estar entre 0 y 100.";
    }
  }

  const ordenados = [...tramos].sort((a, b) => a.desdeCentimos - b.desdeCentimos);
  for (let i = 0; i < ordenados.length - 1; i++) {
    const actual = ordenados[i];
    const siguiente = ordenados[i + 1];
    if (actual.hastaCentimos === null) {
      return 'Solo el tramo más alto puede quedar "sin límite superior" — hay otro tramo por encima de uno abierto.';
    }
    if (actual.hastaCentimos > siguiente.desdeCentimos) {
      return 'Hay tramos que se solapan: revisa los importes "desde" y "hasta".';
    }
  }
  return null;
}

/** Primer y último día (como "YYYY-MM-DD") de un mes dado como "YYYY-MM". */
export function rangoDelMes(mesStr: string): { desdeStr: string; hastaStr: string } {
  const [anioStr, mesNumStr] = mesStr.split("-");
  const anio = Number(anioStr);
  const mesNum = Number(mesNumStr);
  const ultimoDia = new Date(anio, mesNum, 0).getDate();
  return { desdeStr: `${mesStr}-01`, hastaStr: `${mesStr}-${String(ultimoDia).padStart(2, "0")}` };
}

/** El mes actual como "YYYY-MM", para usarlo como valor por defecto. */
export function mesActualStr(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** Suma o resta N meses a un "YYYY-MM", devuelto en el mismo formato. */
export function sumarMeses(mesStr: string, delta: number): string {
  const [anioStr, mesNumStr] = mesStr.split("-");
  const fecha = new Date(Number(anioStr), Number(mesNumStr) - 1 + delta, 1);
  return mesActualStr(fecha);
}

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Etiqueta legible en español de un "YYYY-MM", p. ej. "Septiembre 2026". */
export function etiquetaMes(mesStr: string): string {
  const [anioStr, mesNumStr] = mesStr.split("-");
  return `${MESES_ES[Number(mesNumStr) - 1]} ${anioStr}`;
}
