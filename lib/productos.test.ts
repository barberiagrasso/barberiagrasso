import { describe, expect, it } from "vitest";
import { calcularComisionProductos, validarPorcentajeProductos } from "./productos";

describe("calcularComisionProductos", () => {
  it("aplica el porcentaje plano sobre todo lo vendido, desde el primer euro", () => {
    // 120€ en productos al 15% → 18€, sin ningún umbral mínimo.
    expect(calcularComisionProductos(12000, 15)).toBe(1800);
  });

  it("con 0€ vendidos, la comisión es 0", () => {
    expect(calcularComisionProductos(0, 15)).toBe(0);
  });

  it("con un porcentaje de 0, la comisión es 0 aunque haya ventas", () => {
    expect(calcularComisionProductos(10000, 0)).toBe(0);
  });

  it("redondea al céntimo más cercano", () => {
    // 33,33€ al 15% = 4,9995€ → redondeado a 5,00€ (500 céntimos)
    expect(calcularComisionProductos(3333, 15)).toBe(500);
  });

  it("no admite un total negativo", () => {
    expect(calcularComisionProductos(-500, 15)).toBe(0);
  });
});

describe("validarPorcentajeProductos", () => {
  it("acepta un porcentaje dentro de 0-100", () => {
    expect(validarPorcentajeProductos(15)).toBeNull();
  });

  it("rechaza un porcentaje negativo", () => {
    expect(validarPorcentajeProductos(-5)).not.toBeNull();
  });

  it("rechaza un porcentaje mayor de 100", () => {
    expect(validarPorcentajeProductos(120)).not.toBeNull();
  });
});
