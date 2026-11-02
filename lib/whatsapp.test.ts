import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { firmaWebhookValida } from "./whatsapp";

const SECRETO = "secreto-de-prueba";
const CUERPO = '{"entry":[{"changes":[{"value":{"messages":[{"type":"text"}]}}]}]}';
function firmar(cuerpo: string, secreto: string) {
  return "sha256=" + createHmac("sha256", secreto).update(cuerpo).digest("hex");
}

describe("firmaWebhookValida", () => {
  it("acepta una firma calculada con el secreto correcto", () => {
    expect(firmaWebhookValida(CUERPO, firmar(CUERPO, SECRETO), SECRETO)).toBe(true);
  });

  it("rechaza una firma calculada con otro secreto", () => {
    expect(firmaWebhookValida(CUERPO, firmar(CUERPO, "otro-secreto"), SECRETO)).toBe(false);
  });

  it("rechaza si el cuerpo cambió después de firmar", () => {
    expect(firmaWebhookValida(CUERPO + "x", firmar(CUERPO, SECRETO), SECRETO)).toBe(false);
  });

  it("rechaza cuando no hay cabecera de firma", () => {
    expect(firmaWebhookValida(CUERPO, null, SECRETO)).toBe(false);
  });

  it("rechaza una cabecera con formato inválido (sin el prefijo sha256=)", () => {
    expect(firmaWebhookValida(CUERPO, "no-es-una-firma", SECRETO)).toBe(false);
  });

  it("rechaza si el secreto está vacío, aunque la firma 'cuadre' con una clave vacía", () => {
    expect(firmaWebhookValida(CUERPO, firmar(CUERPO, ""), "")).toBe(false);
  });
});
