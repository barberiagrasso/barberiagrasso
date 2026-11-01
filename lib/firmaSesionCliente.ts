// Firma y comprobación de la cookie de sesión de cliente (ver
// lib/sesionCliente.ts). Separado para poder probarlo sin servidor.
import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE_SESION_CLIENTE = "grasso_cliente";
export const DURACION_SESION_SEGUNDOS = 365 * 24 * 60 * 60;

function clave(): Buffer {
  const base = process.env.CLIENTE_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("Falta la clave para firmar la sesión de cliente.");
  return createHmac("sha256", base).update("grasso-sesion-cliente-v1").digest();
}

function firmar(datos: string): string {
  return createHmac("sha256", clave()).update(datos).digest("base64url");
}

/** Valor de cookie "clienteId.expira.firma". */
export function crearValorSesion(clienteId: string, ahora = Date.now()): string {
  const expira = Math.floor(ahora / 1000) + DURACION_SESION_SEGUNDOS;
  const datos = `${clienteId}.${expira}`;
  return `${datos}.${firmar(datos)}`;
}

/** El id del cliente si la cookie es auténtica y no ha caducado; si no, null. */
export function leerValorSesion(valor: string | undefined | null, ahora = Date.now()): string | null {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [clienteId, expiraTxt, firma] = partes;
  if (!/^[0-9a-f-]{36}$/i.test(clienteId) || !/^\d+$/.test(expiraTxt)) return null;
  const esperada = Buffer.from(firmar(`${clienteId}.${expiraTxt}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  if (Number(expiraTxt) * 1000 < ahora) return null;
  return clienteId;
}

