import { describe, expect, it } from "vitest";
import { minutosAgendaExtra, minutosAgendaExtras } from "./duracionExtras";

describe("extras cortos sin tiempo de agenda", () => {
  it("cejas o nariz (1–5 min) no alargan la cita", () => {
    expect(minutosAgendaExtra(1)).toBe(0);
    expect(minutosAgendaExtra(5)).toBe(0);
  });
  it("un extra de verdad (lavado, mascarilla…) sí suma", () => {
    expect(minutosAgendaExtra(15)).toBe(15);
    expect(minutosAgendaExtras([{ duracion_minutos: 1 }, { duracion_minutos: 15 }, { duracion_minutos: null }])).toBe(15);
  });
});
