import { describe, expect, it } from "vitest";
import { desgloseCaja, rangoDiaMadrid, textoAvisoCierre } from "./caja";
import type { DatosRecibo } from "./recibo";

const r = (p: Partial<DatosRecibo>): DatosRecibo =>
  ({ totalCentimos: 0, pagadoConSaldoCentimos: 0, metodoPago: "efectivo", pagosMixtos: [], anulado: null, ...p }) as DatosRecibo;

describe("desgloseCaja", () => {
  it("separa por método, ignora bono, saldo y anulados", () => {
    const d = desgloseCaja([
      r({ totalCentimos: 1500, metodoPago: "efectivo" }),
      r({ totalCentimos: 2000, metodoPago: "tarjeta" }),
      r({ totalCentimos: 1000, metodoPago: "bizum", pagadoConSaldoCentimos: 300 }),
      r({ totalCentimos: 1800, metodoPago: "bono" }),
      r({ totalCentimos: 900, metodoPago: "efectivo", anulado: { atISO: "", por: null, motivo: null } }),
      r({ totalCentimos: 3000, metodoPago: "mixto", pagosMixtos: [{ metodo: "efectivo", importeCentimos: 1000 }, { metodo: "tarjeta", importeCentimos: 2000 }] }),
    ]);
    expect(d).toEqual({ efectivo: 2500, tarjeta: 4000, bizum: 700, otros: 0, numCobros: 5 });
  });
});

describe("rangoDiaMadrid", () => {
  it("invierno UTC+1", () => {
    expect(rangoDiaMadrid("2026-11-19")).toEqual({ desde: "2026-11-18T23:00:00.000Z", hasta: "2026-11-19T23:00:00.000Z" });
  });
  it("verano UTC+2", () => {
    expect(rangoDiaMadrid("2026-07-01").desde).toBe("2026-06-30T22:00:00.000Z");
  });
});

it("aviso dice si falta dinero", () => {
  const t = textoAvisoCierre({ sede: "Molinos", fecha: "2026-11-19", encargado: "Juan", desglose: { efectivo: 10000, tarjeta: 0, bizum: 0, otros: 0, numCobros: 5 }, contado: 14500, esperado: 15000, motivo: "cambio mal dado", fondoSiguiente: 5000 });
  expect(t).toContain("Faltan 5,00 €");
  expect(t).toContain("Sobre: 95,00 €");
});
