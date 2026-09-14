import { describe, expect, it } from "vitest";
import {
  codigoRecuperacionCoincide,
  generarCodigoRecuperacion,
  hashearCodigoRecuperacion,
} from "./recuperacionPassword";

// Estas funciones son la única barrera entre "alguien adivina un código
// de 6 dígitos" y "le cambia la contraseña a otro cliente" — merece la
// pena tenerlas cubiertas con tests, aunque sean pequeñas.
describe("generarCodigoRecuperacion", () => {
  it("siempre devuelve 6 dígitos, con ceros a la izquierda si hace falta", () => {
    for (let i = 0; i < 200; i++) {
      const codigo = generarCodigoRecuperacion();
      expect(codigo).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashearCodigoRecuperacion / codigoRecuperacionCoincide", () => {
  it("un código coincide con su propio hash", () => {
    const codigo = "042817";
    expect(codigoRecuperacionCoincide(codigo, hashearCodigoRecuperacion(codigo))).toBe(true);
  });

  it("un código distinto no coincide", () => {
    const hash = hashearCodigoRecuperacion("042817");
    expect(codigoRecuperacionCoincide("042818", hash)).toBe(false);
    expect(codigoRecuperacionCoincide("000000", hash)).toBe(false);
  });

  it("no rompe con un hash guardado con formato inválido", () => {
    expect(codigoRecuperacionCoincide("042817", "no-es-un-hash-valido")).toBe(false);
  });

  it("el hash es determinista (mismo código, mismo hash)", () => {
    expect(hashearCodigoRecuperacion("123456")).toBe(hashearCodigoRecuperacion("123456"));
  });
});
