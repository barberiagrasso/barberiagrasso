import { describe, expect, it } from "vitest";
import { emailSinteticoParaUsuarioEquipo, usuarioDesdeNombreProfesional } from "./usuarioEquipo";

describe("usuarioDesdeNombreProfesional", () => {
  it("genera un usuario simple para un nombre sin aclaración", () => {
    expect(usuarioDesdeNombreProfesional("Arthur")).toBe("arthur");
    expect(usuarioDesdeNombreProfesional("David")).toBe("david");
  });

  it("quita acentos y pasa a minúsculas", () => {
    expect(usuarioDesdeNombreProfesional("José Ángel")).toBe("jose.angel");
  });

  it("usa la aclaración entre paréntesis para desambiguar dos profesionales con el mismo nombre", () => {
    expect(usuarioDesdeNombreProfesional("Juan (Los Molinos)")).toBe("juan.molinos");
    expect(usuarioDesdeNombreProfesional("Juan (Avenida de las Ciudades)")).toBe("juan.avenida.ciudades");
  });

  it("los dos Juan generan usuarios distintos", () => {
    const a = usuarioDesdeNombreProfesional("Juan (Los Molinos)");
    const b = usuarioDesdeNombreProfesional("Juan (Avenida de las Ciudades)");
    expect(a).not.toBe(b);
  });

  it("añade el sufijo si se pide, para deshacer un empate", () => {
    expect(usuarioDesdeNombreProfesional("Juan", 2)).toBe("juan.2");
  });
});

describe("emailSinteticoParaUsuarioEquipo", () => {
  it("es determinista y usa el dominio de equipo", () => {
    expect(emailSinteticoParaUsuarioEquipo("juan.molinos")).toBe("juan.molinos@equipo.barberiagrasso.internal");
  });
});
