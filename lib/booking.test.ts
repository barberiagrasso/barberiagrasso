import { describe, expect, it, vi, afterEach } from "vitest";
import { puedeGestionarseAutomaticamente, MINUTOS_MINIMOS_CANCELACION_AUTOMATICA } from "./booking";

// Esta regla decide si el asistente de WhatsApp puede cancelar/mover una
// cita él solo, o si tiene que decirle al cliente que llame a la
// barbería. Un fallo aquí deja a la IA tocar citas demasiado cercanas
// (mal para el barbero) o negarse a gestionar citas con margen de sobra
// (mala experiencia para el cliente).
describe("puedeGestionarseAutomaticamente", () => {
  const ahora = new Date("2026-06-15T10:00:00.000Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`permite gestionar una cita a más de ${MINUTOS_MINIMOS_CANCELACION_AUTOMATICA} minutos vista`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    const citaEn2Horas = new Date(ahora.getTime() + 2 * 60 * 60 * 1000).toISOString();
    expect(puedeGestionarseAutomaticamente(citaEn2Horas)).toBe(true);
  });

  it("no permite gestionar una cita a menos de 60 minutos vista", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    const citaEn30Minutos = new Date(ahora.getTime() + 30 * 60 * 1000).toISOString();
    expect(puedeGestionarseAutomaticamente(citaEn30Minutos)).toBe(false);
  });

  it("no permite gestionar una cita que ya ha pasado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    const citaDeAyer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(puedeGestionarseAutomaticamente(citaDeAyer)).toBe(false);
  });

  it("el límite exacto de 60 minutos sí se puede gestionar (>=, no solo >)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    const citaJustoEnElLimite = new Date(ahora.getTime() + MINUTOS_MINIMOS_CANCELACION_AUTOMATICA * 60 * 1000).toISOString();
    expect(puedeGestionarseAutomaticamente(citaJustoEnElLimite)).toBe(true);
  });
});
