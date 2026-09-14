import { describe, expect, it } from "vitest";
import { rutaSiguienteSegura } from "./rutaSiguiente";

describe("rutaSiguienteSegura", () => {
  it("devuelve la ruta por defecto si no hay valor", () => {
    expect(rutaSiguienteSegura(null, "/admin/dashboard")).toBe("/admin/dashboard");
    expect(rutaSiguienteSegura(undefined, "/admin/dashboard")).toBe("/admin/dashboard");
    expect(rutaSiguienteSegura("", "/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("acepta una ruta relativa normal", () => {
    expect(rutaSiguienteSegura("/perfil", "/")).toBe("/perfil");
    expect(rutaSiguienteSegura("/admin/clientes/123", "/admin/dashboard")).toBe("/admin/clientes/123");
  });

  it("conserva la query string de la ruta pedida", () => {
    expect(rutaSiguienteSegura("/reservar?sede=los-molinos", "/")).toBe("/reservar?sede=los-molinos");
  });

  it("rechaza una ruta que no empieza por /", () => {
    expect(rutaSiguienteSegura("https://evil.example.com", "/admin/dashboard")).toBe("/admin/dashboard");
    expect(rutaSiguienteSegura("evil.example.com", "/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("rechaza un protocol-relative URL (//) para evitar un open redirect", () => {
    expect(rutaSiguienteSegura("//evil.example.com", "/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("rechaza una ruta que empieza por /\\ (otro truco de open redirect)", () => {
    expect(rutaSiguienteSegura("/\\evil.example.com", "/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("rechaza cualquiera de las dos pantallas de login como destino, para no crear un bucle", () => {
    expect(rutaSiguienteSegura("/acceso", "/")).toBe("/");
    expect(rutaSiguienteSegura("/admin/login", "/admin/dashboard")).toBe("/admin/dashboard");
    // También si el "next" pedido es la pantalla de login contraria a la que
    // hizo la petición: mismo criterio, sin excepciones por contexto.
    expect(rutaSiguienteSegura("/acceso", "/admin/dashboard")).toBe("/admin/dashboard");
    expect(rutaSiguienteSegura("/admin/login", "/")).toBe("/");
  });
});
