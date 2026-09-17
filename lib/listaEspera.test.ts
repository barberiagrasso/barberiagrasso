import { describe, expect, it } from "vitest";
import {
  sumarDias,
  diferenciaEnDias,
  fechaDentroDeFlexibilidad,
  etiquetaFlexibilidad,
  esFlexibilidadValida,
} from "./listaEspera";

describe("sumarDias", () => {
  it("suma días dentro del mismo mes", () => {
    expect(sumarDias("2026-09-10", 2)).toBe("2026-09-12");
  });
  it("resta días con un número negativo", () => {
    expect(sumarDias("2026-09-10", -2)).toBe("2026-09-08");
  });
  it("cruza el fin de mes correctamente", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
  });
  it("cruza el fin de año correctamente", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("con 0 días devuelve la misma fecha", () => {
    expect(sumarDias("2026-09-10", 0)).toBe("2026-09-10");
  });
});

describe("diferenciaEnDias", () => {
  it("es positiva cuando a es posterior a b", () => {
    expect(diferenciaEnDias("2026-09-12", "2026-09-10")).toBe(2);
  });
  it("es negativa cuando a es anterior a b", () => {
    expect(diferenciaEnDias("2026-09-10", "2026-09-12")).toBe(-2);
  });
  it("es 0 para la misma fecha", () => {
    expect(diferenciaEnDias("2026-09-10", "2026-09-10")).toBe(0);
  });
  it("cruza meses correctamente", () => {
    expect(diferenciaEnDias("2026-10-02", "2026-09-30")).toBe(2);
  });
});

describe("fechaDentroDeFlexibilidad", () => {
  it("con flexibilidad 0, solo encaja el día exacto", () => {
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-10", 0)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-11", 0)).toBe(false);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-09", 0)).toBe(false);
  });

  it("con flexibilidad 1, encajan el día pedido y uno antes/después", () => {
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-09", 1)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-10", 1)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-11", 1)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-12", 1)).toBe(false);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-08", 1)).toBe(false);
  });

  it("con flexibilidad 2, encajan hasta 2 días antes/después", () => {
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-08", 2)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-12", 2)).toBe(true);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-07", 2)).toBe(false);
    expect(fechaDentroDeFlexibilidad("2026-09-10", "2026-09-13", 2)).toBe(false);
  });
});

describe("esFlexibilidadValida", () => {
  it("acepta 0, 1 y 2", () => {
    expect(esFlexibilidadValida(0)).toBe(true);
    expect(esFlexibilidadValida(1)).toBe(true);
    expect(esFlexibilidadValida(2)).toBe(true);
  });
  it("rechaza otros números, texto o valores vacíos", () => {
    expect(esFlexibilidadValida(3)).toBe(false);
    expect(esFlexibilidadValida(-1)).toBe(false);
    expect(esFlexibilidadValida("1")).toBe(false);
    expect(esFlexibilidadValida(undefined)).toBe(false);
    expect(esFlexibilidadValida(null)).toBe(false);
  });
});

describe("etiquetaFlexibilidad", () => {
  it("describe el margen exacto", () => {
    expect(etiquetaFlexibilidad(0)).toBe("solo ese día exacto");
  });
  it("describe ±1 día en singular", () => {
    expect(etiquetaFlexibilidad(1)).toBe("ese día, o hasta 1 día antes o después");
  });
  it("describe ±2 días en plural", () => {
    expect(etiquetaFlexibilidad(2)).toBe("ese día, o hasta 2 días antes o después");
  });
});
