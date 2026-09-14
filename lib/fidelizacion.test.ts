import { describe, expect, it } from "vitest";
import { calcularAcumulacionCentimos, PORCENTAJE_FIDELIZACION } from "./fidelizacion";

// Esta cuenta decide cuánto saldo real se apunta cada cliente por cada
// cita completada: un fallo de redondeo aquí, multiplicado por cientos
// de citas al mes, es dinero que Diego regala o se queda de más sin
// querer.
describe("calcularAcumulacionCentimos", () => {
  it(`acumula el ${PORCENTAJE_FIDELIZACION * 100}% de lo pagado`, () => {
    expect(calcularAcumulacionCentimos(1000)).toBe(100); // 10€ → 1€
    expect(calcularAcumulacionCentimos(2500)).toBe(250); // 25€ → 2,50€
  });

  it("redondea al céntimo más cercano en vez de dejar decimales", () => {
    expect(calcularAcumulacionCentimos(999)).toBe(100); // 9,99 * 0.10 = 99.9 → 100
    expect(calcularAcumulacionCentimos(1005)).toBe(101); // 10,05 * 0.10 = 100.5 → 101
    expect(calcularAcumulacionCentimos(1)).toBe(0); // 0,01 * 0.10 = 0.1 → 0
  });

  it("nunca genera saldo negativo aunque el total sea 0 o negativo", () => {
    expect(calcularAcumulacionCentimos(0)).toBe(0);
    expect(calcularAcumulacionCentimos(-500)).toBe(0);
  });

  it("no rompe con valores no numéricos", () => {
    expect(calcularAcumulacionCentimos(Number.NaN)).toBe(0);
  });
});
