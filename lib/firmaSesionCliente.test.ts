import { describe, expect, it } from "vitest";
import { crearValorSesion, leerValorSesion } from "./firmaSesionCliente";

process.env.CLIENTE_SESSION_SECRET = "secreto-de-prueba";
const ID = "3f2b8c1e-1234-4abc-9def-0123456789ab";
const OTRO = "aaaaaaaa-1234-4abc-9def-0123456789ab";

describe("cookie de sesión de cliente", () => {
  it("una cookie auténtica devuelve su cliente", () => {
    expect(leerValorSesion(crearValorSesion(ID))).toBe(ID);
  });
  it("cambiar el id para hacerse pasar por otro cliente no sirve", () => {
    const [, expira, firma] = crearValorSesion(ID).split(".");
    expect(leerValorSesion(`${OTRO}.${expira}.${firma}`)).toBeNull();
  });
  it("alargar la caducidad a mano no sirve", () => {
    const [id, , firma] = crearValorSesion(ID).split(".");
    expect(leerValorSesion(`${id}.9999999999.${firma}`)).toBeNull();
  });
  it("caduca al año", () => {
    const valor = crearValorSesion(ID, Date.now());
    expect(leerValorSesion(valor, Date.now() + 366 * 24 * 3600 * 1000)).toBeNull();
    expect(leerValorSesion(valor, Date.now() + 360 * 24 * 3600 * 1000)).toBe(ID);
  });
  it("basura o vacío no es sesión", () => {
    expect(leerValorSesion("")).toBeNull();
    expect(leerValorSesion("hola")).toBeNull();
    expect(leerValorSesion(undefined)).toBeNull();
  });
  it("con otra clave secreta, la cookie deja de valer", () => {
    const valor = crearValorSesion(ID);
    process.env.CLIENTE_SESSION_SECRET = "otra-clave";
    expect(leerValorSesion(valor)).toBeNull();
    process.env.CLIENTE_SESSION_SECRET = "secreto-de-prueba";
  });
});
