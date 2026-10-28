// Cuánto factura un barbero por una cita completada. Es EL criterio de
// Comisiones (app/api/admin/comisiones) y también lo usa Rendimiento
// (lib/rendimiento.ts): vive aquí, en un solo sitio, para que los dos
// módulos den siempre la misma cifra.
import { precioCitaCentimos } from "@/lib/precios";

export interface CitaParaFacturacion {
  id: string;
  saldo_canjeado_centimos: number;
  precio_final_centimos: number | null;
  bono_id: string | null;
  descuento_porcentaje: number | null;
  servicio: { precio_centimos: number } | { precio_centimos: number }[] | null;
}

export interface BonoParaComision {
  precio_pagado_centimos: number;
  usos_totales: number;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Mismo criterio que /api/admin/informes/resumen: el precio del servicio
// más sus complementos (o el precio final corregido a mano al cerrar la
// cita, si lo hay — ver lib/precios.ts), salvo que se haya pagado con
// saldo de fidelización (ahí no entró dinero real, así que tampoco debe
// generar comisión — ya se contó como gasto real cuando se generó ese saldo).
//
// Dos excepciones más, que se comprueban ANTES que la regla general
// porque cambian de qué número sale "el servicio" (los complementos, en
// cambio, siempre cuentan aparte y enteros, con o sin bono o descuento):
//
//  - Si la cita tiene bono_id (la vendió o canjeó un uso de un bono), el
//    barbero no comisiona por el precio del servicio, sino por la parte
//    proporcional de UN uso del bono (precio_pagado_centimos /
//    usos_totales, redondeado) — igual para la cita de compra que para
//    cada cita de canje posterior, sea o no el mismo barbero.
//  - Si la cita tiene descuento_porcentaje (descuento con motivo
//    aplicado desde el checkout), el barbero comisiona por el precio
//    AUTOMÁTICO de catálogo, sin restar el descuento — el descuento lo
//    absorbe la barbería, no el barbero (precio_final_centimos, que sí
//    lleva el descuento aplicado, no se usa aquí).
export function ingresoCitaCentimos(
  c: CitaParaFacturacion,
  extrasPorCita: Map<string, number>,
  bonosPorId: Map<string, BonoParaComision>
): number {
  if (c.saldo_canjeado_centimos > 0) return 0;
  const extras = extrasPorCita.get(c.id) ?? 0;

  if (c.bono_id) {
    const bono = bonosPorId.get(c.bono_id);
    if (bono && bono.usos_totales > 0) {
      return Math.round(bono.precio_pagado_centimos / bono.usos_totales) + extras;
    }
  }

  const servicio = uno(c.servicio);
  const automatico = (servicio?.precio_centimos ?? 0) + extras;
  if (c.descuento_porcentaje) return automatico;

  return precioCitaCentimos(c.precio_final_centimos, automatico);
}
