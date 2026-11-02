import { describe, it, expect } from "vitest";
import { clasesBoton, clasesInsignia } from "./estilosUi";

describe("clasesBoton", () => {
  it("primario: fondo negro, texto crema", () => {
    expect(clasesBoton("primario")).toBe("bg-brand-black text-brand-white hover:opacity-90");
  });
  it("acento: fondo amarillo", () => {
    expect(clasesBoton("acento")).toBe("bg-brand-yellow text-brand-yellow-ink hover:bg-brand-yellow-dark");
  });
  it("secundario: borde, sin relleno", () => {
    expect(clasesBoton("secundario")).toBe("border border-stone-300 bg-transparent text-stone-900 hover:bg-stone-100");
  });
});

describe("clasesInsignia", () => {
  it("neutral: gris", () => {
    expect(clasesInsignia("neutral")).toBe("bg-stone-100 text-stone-700");
  });
  it("exito: verde", () => {
    expect(clasesInsignia("exito")).toBe("bg-emerald-100 text-emerald-800");
  });
  it("alerta: ámbar", () => {
    expect(clasesInsignia("alerta")).toBe("bg-amber-100 text-amber-800");
  });
  it("error: rojo", () => {
    expect(clasesInsignia("error")).toBe("bg-red-100 text-red-800");
  });
});
