import { describe, expect, it } from "vitest";
import { seSolapanRangos, colorDeProfesional, fechasDelRango } from "./vacaciones";

describe("seSolapanRangos", () => {
  it("dos rangos que no se tocan no se solapan", () => {
    expect(seSolapanRangos({ inicio: "2026-08-01", fin: "2026-08-05" }, { inicio: "2026-08-10", fin: "2026-08-15" })).toBe(false);
  });

  it("dos rangos que comparten un solo día se solapan", () => {
    expect(seSolapanRangos({ inicio: "2026-08-01", fin: "2026-08-05" }, { inicio: "2026-08-05", fin: "2026-08-10" })).toBe(true);
  });

  it("un rango totalmente dentro de otro se solapa", () => {
    expect(seSolapanRangos({ inicio: "2026-08-01", fin: "2026-08-31" }, { inicio: "2026-08-10", fin: "2026-08-12" })).toBe(true);
  });

  it("un solo día igual en ambos rangos se solapa", () => {
    expect(seSolapanRangos({ inicio: "2026-08-01", fin: "2026-08-01" }, { inicio: "2026-08-01", fin: "2026-08-01" })).toBe(true);
  });

  it("el orden de los argumentos no cambia el resultado", () => {
    const a = { inicio: "2026-08-01", fin: "2026-08-05" };
    const b = { inicio: "2026-08-04", fin: "2026-08-09" };
    expect(seSolapanRangos(a, b)).toBe(seSolapanRangos(b, a));
  });
});

describe("colorDeProfesional", () => {
  it("da siempre el mismo color al mismo profesional, según su posición en la lista", () => {
    const orden = ["prof-a", "prof-b", "prof-c"];
    expect(colorDeProfesional("prof-b", orden)).toEqual(colorDeProfesional("prof-b", orden));
  });

  it("dos profesionales distintos (dentro de la paleta) reciben colores distintos", () => {
    const orden = ["prof-a", "prof-b"];
    expect(colorDeProfesional("prof-a", orden)).not.toEqual(colorDeProfesional("prof-b", orden));
  });

  it("un profesional que no está en la lista no revienta: cae en un color por defecto", () => {
    expect(() => colorDeProfesional("desconocido", ["prof-a"])).not.toThrow();
  });
});

describe("fechasDelRango", () => {
  it("un solo día devuelve solo esa fecha", () => {
    expect(fechasDelRango({ inicio: "2026-08-01", fin: "2026-08-01" })).toEqual(["2026-08-01"]);
  });

  it("un rango de varios días devuelve cada fecha, en orden", () => {
    expect(fechasDelRango({ inicio: "2026-08-28", fin: "2026-09-02" })).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("cruza correctamente un cambio de año", () => {
    expect(fechasDelRango({ inicio: "2026-12-30", fin: "2027-01-02" })).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
});
