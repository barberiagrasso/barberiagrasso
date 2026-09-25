import { describe, expect, it } from "vitest";
import { resolverPorNombre, franjasUnicasPorHora, ordenarPorCercania, formatoFechaLarga } from "./asistenteReserva";
import type { FranjaDisponible } from "./types";

describe("resolverPorNombre", () => {
  const catalogo = [{ nombre: "Corte" }, { nombre: "Corte y barba" }, { nombre: "Barba" }];

  it("encuentra una coincidencia exacta (sin distinguir mayúsculas)", () => {
    expect(resolverPorNombre("barba", catalogo)?.nombre).toBe("Barba");
  });

  it("cuando no hay coincidencia exacta, encuentra por inclusión parcial", () => {
    expect(resolverPorNombre("un corte de pelo", catalogo)?.nombre).toBe("Corte");
  });

  it("prioriza la coincidencia exacta sobre una parcial más larga que también encajaría", () => {
    expect(resolverPorNombre("Corte", catalogo)?.nombre).toBe("Corte");
  });

  it("devuelve undefined si no hay ninguna coincidencia razonable", () => {
    expect(resolverPorNombre("manicura", catalogo)).toBeUndefined();
  });
});

describe("franjasUnicasPorHora", () => {
  it("se queda con una sola franja por cada hora_inicio distinta", () => {
    const franjas: FranjaDisponible[] = [
      { hora_inicio: "2026-09-26T09:00:00.000Z", profesional_id: "a", profesional_nombre: "Arthur" },
      { hora_inicio: "2026-09-26T09:00:00.000Z", profesional_id: "b", profesional_nombre: "David" },
      { hora_inicio: "2026-09-26T09:30:00.000Z", profesional_id: "a", profesional_nombre: "Arthur" },
    ];
    const resultado = franjasUnicasPorHora(franjas);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((f) => f.hora_inicio)).toEqual(["2026-09-26T09:00:00.000Z", "2026-09-26T09:30:00.000Z"]);
  });
});

describe("ordenarPorCercania", () => {
  const franjas: FranjaDisponible[] = [
    { hora_inicio: "2026-09-26T16:00:00.000Z", profesional_id: "a", profesional_nombre: "Arthur" }, // 18:00 Madrid (verano)
    { hora_inicio: "2026-09-26T07:30:00.000Z", profesional_id: "b", profesional_nombre: "David" }, // 09:30 Madrid
    { hora_inicio: "2026-09-26T11:00:00.000Z", profesional_id: "c", profesional_nombre: "Juan" }, // 13:00 Madrid
  ];

  it("sin hora objetivo, ordena cronológicamente de más temprano a más tarde", () => {
    const resultado = ordenarPorCercania(franjas, null);
    expect(resultado.map((f) => f.profesional_nombre)).toEqual(["David", "Juan", "Arthur"]);
  });

  it("con hora objetivo, ordena por cercanía a esa hora (aunque no coincida exactamente)", () => {
    // Pide "por la tarde" ~17:00 → la más cercana es las 18:00 (Arthur), luego 13:00 (Juan), luego 09:30 (David)
    const resultado = ordenarPorCercania(franjas, 17 * 60);
    expect(resultado.map((f) => f.profesional_nombre)).toEqual(["Arthur", "Juan", "David"]);
  });
});

describe("formatoFechaLarga", () => {
  it("da un texto en español, en día de la semana + fecha", () => {
    const texto = formatoFechaLarga("2026-09-26");
    expect(texto).toContain("septiembre");
    expect(texto.toLowerCase()).toContain("sábado");
  });
});
