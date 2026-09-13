import { describe, expect, it } from "vitest";
import { normalizarTelefono, emailSinteticoParaTelefono } from "./clientes";

// normalizarTelefono es la pieza más crítica de todo el proyecto: es lo
// que decide si dos altas distintas (reserva desde la app, mensaje de
// WhatsApp, alta manual desde el panel, registro de cuenta) son "la
// misma persona" o dos clientes diferentes. Un fallo aquí duplica
// clientes o, peor, mezcla el historial de dos personas distintas.
describe("normalizarTelefono", () => {
  it("añade el prefijo +34 a un móvil español de 9 dígitos sin prefijo", () => {
    expect(normalizarTelefono("612345678")).toBe("+34612345678");
    expect(normalizarTelefono("712345678")).toBe("+34712345678");
    expect(normalizarTelefono("912345678")).toBe("+34912345678");
  });

  it("ignora espacios y separadores al escribir el número", () => {
    expect(normalizarTelefono("612 345 678")).toBe("+34612345678");
    expect(normalizarTelefono("612-345-678")).toBe("+34612345678");
    expect(normalizarTelefono(" 612.345.678 ")).toBe("+34612345678");
  });

  it("respeta un número que ya llega con + y prefijo de país", () => {
    expect(normalizarTelefono("+34612345678")).toBe("+34612345678");
    expect(normalizarTelefono("+1 555 123 4567")).toBe("+15551234567");
  });

  it("añade + a un número que llega sin él pero con prefijo de país (como manda WhatsApp)", () => {
    expect(normalizarTelefono("34612345678")).toBe("+34612345678");
  });

  it("la misma persona escrita de formas distintas siempre normaliza igual", () => {
    const variantes = ["612345678", "612 345 678", "+34612345678", "34612345678", "612-345-678"];
    const normalizados = new Set(variantes.map(normalizarTelefono));
    expect(normalizados.size).toBe(1);
    expect([...normalizados][0]).toBe("+34612345678");
  });
});

describe("emailSinteticoParaTelefono", () => {
  it("genera siempre el mismo email a partir del mismo teléfono normalizado", () => {
    const email1 = emailSinteticoParaTelefono("+34612345678");
    const email2 = emailSinteticoParaTelefono("+34612345678");
    expect(email1).toBe(email2);
  });

  it("no incluye el + inicial y usa el dominio interno esperado", () => {
    expect(emailSinteticoParaTelefono("+34612345678")).toBe("34612345678@clientes.barberiagrasso.internal");
  });
});
