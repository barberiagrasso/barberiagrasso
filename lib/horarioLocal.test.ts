import { describe, expect, it } from "vitest";
import { fechaEnMadrid, horaEnMadrid, isoDesdeMadrid } from "./horarioLocal";

describe("isoDesdeMadrid", () => {
  it("en horario de invierno (CET, UTC+1) resta una hora", () => {
    expect(isoDesdeMadrid("2026-01-15", "10:00")).toBe("2026-01-15T09:00:00.000Z");
  });

  it("en horario de verano (CEST, UTC+2) resta dos horas", () => {
    expect(isoDesdeMadrid("2026-07-15", "10:00")).toBe("2026-07-15T08:00:00.000Z");
  });

  it("funciona justo después del cambio a horario de verano", () => {
    // En 2026 el cambio a verano es el domingo 29 de marzo (02:00 → 03:00).
    expect(isoDesdeMadrid("2026-03-30", "12:00")).toBe("2026-03-30T10:00:00.000Z");
  });

  it("funciona justo después del cambio a horario de invierno", () => {
    // En 2026 el cambio a invierno es el domingo 25 de octubre.
    expect(isoDesdeMadrid("2026-10-26", "12:00")).toBe("2026-10-26T11:00:00.000Z");
  });

  it("cruza la medianoche sin desbordar el día", () => {
    expect(isoDesdeMadrid("2026-01-01", "00:30")).toBe("2025-12-31T23:30:00.000Z");
  });
});

describe("fechaEnMadrid y horaEnMadrid (ida y vuelta con isoDesdeMadrid)", () => {
  it("recupera exactamente la fecha y hora de reloj originales", () => {
    const iso = isoDesdeMadrid("2026-07-15", "18:45");
    expect(fechaEnMadrid(iso)).toBe("2026-07-15");
    expect(horaEnMadrid(iso)).toBe("18:45");
  });

  it("recupera fecha y hora también en invierno", () => {
    const iso = isoDesdeMadrid("2026-12-24", "09:15");
    expect(fechaEnMadrid(iso)).toBe("2026-12-24");
    expect(horaEnMadrid(iso)).toBe("09:15");
  });
});
