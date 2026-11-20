// Cálculos del cierre de caja (sin base de datos, para poder probarlos).
import type { DatosRecibo } from "@/lib/recibo";

export interface DesgloseCaja {
  efectivo: number;
  tarjeta: number;
  bizum: number;
  otros: number;
  numCobros: number;
}

/**
 * Dinero que ENTRÓ en el día por método de pago, a partir de los recibos
 * de las citas cobradas. Lo pagado con saldo de fidelización o con un
 * bono ya comprado no es dinero nuevo y no cuenta. Recibos anulados,
 * fuera.
 */
export function desgloseCaja(recibos: DatosRecibo[]): DesgloseCaja {
  const d: DesgloseCaja = { efectivo: 0, tarjeta: 0, bizum: 0, otros: 0, numCobros: 0 };
  const sumar = (metodo: string | null, importe: number) => {
    if (importe <= 0 || metodo === "bono") return;
    if (metodo === "efectivo") d.efectivo += importe;
    else if (metodo === "tarjeta") d.tarjeta += importe;
    else if (metodo === "bizum") d.bizum += importe;
    else d.otros += importe;
  };
  for (const r of recibos) {
    if (r.anulado) continue;
    d.numCobros++;
    if (r.metodoPago === "mixto" && r.pagosMixtos.length > 0) {
      for (const p of r.pagosMixtos) sumar(p.metodo, p.importeCentimos);
    } else {
      sumar(r.metodoPago, Math.max(0, r.totalCentimos - r.pagadoConSaldoCentimos));
    }
  }
  return d;
}

/** "YYYY-MM-DD" de hoy (o de la fecha dada) en hora de Madrid. */
export function fechaMadrid(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function offsetMadridMin(utc: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(utc)
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - utc.getTime()) / 60000);
}

/** Inicio y fin (ISO UTC) del día `fecha` en Madrid. */
export function rangoDiaMadrid(fecha: string): { desde: string; hasta: string } {
  const [y, m, d] = fecha.split("-").map(Number);
  const inicio = (yy: number, mm: number, dd: number) => {
    const aprox = new Date(Date.UTC(yy, mm - 1, dd));
    return new Date(aprox.getTime() - offsetMadridMin(aprox) * 60000);
  };
  const desde = inicio(y, m, d);
  const sig = new Date(Date.UTC(y, m - 1, d + 1));
  const hasta = inicio(sig.getUTCFullYear(), sig.getUTCMonth() + 1, sig.getUTCDate());
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/** Texto del aviso de cierre que se manda a David. */
export function textoAvisoCierre(c: {
  sede: string;
  fecha: string;
  encargado: string;
  desglose: DesgloseCaja;
  contado: number;
  esperado: number;
  motivo: string | null;
  fondoSiguiente: number;
}): string {
  const e = (n: number) => (n / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const dif = c.contado - c.esperado;
  const total = c.desglose.efectivo + c.desglose.tarjeta + c.desglose.bizum + c.desglose.otros;
  return [
    `🧾 Cierre de caja · ${c.sede} · ${c.fecha.split("-").reverse().join("/")}`,
    `Cerrado por ${c.encargado}`,
    `Total cobrado: ${e(total)} (${c.desglose.numCobros} cobros)`,
    `Efectivo ${e(c.desglose.efectivo)} · Tarjeta ${e(c.desglose.tarjeta)} · Bizum ${e(c.desglose.bizum)}` + (c.desglose.otros ? ` · Otros ${e(c.desglose.otros)}` : ""),
    `Caja contada ${e(c.contado)} (esperado ${e(c.esperado)})`,
    dif === 0 ? "✅ Cuadra" : `⚠️ ${dif > 0 ? "Sobran" : "Faltan"} ${e(Math.abs(dif))}: ${c.motivo ?? ""}`,
    `Sobre: ${e(Math.max(0, c.contado - c.fondoSiguiente))} · Fondo para mañana: ${e(c.fondoSiguiente)}`,
  ].join("\n");
}
