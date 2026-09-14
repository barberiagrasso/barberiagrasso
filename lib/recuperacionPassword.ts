import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Cuánto dura un código de recuperación antes de caducar. */
export const MINUTOS_VALIDEZ_CODIGO = 10;

/** Intentos de código equivocado permitidos antes de invalidarlo. */
export const MAX_INTENTOS_CODIGO = 5;

/**
 * Genera un código de 6 dígitos (con ceros a la izquierda si hace
 * falta, p. ej. "004821") para mandar por WhatsApp. Usa el generador
 * aleatorio criptográfico de Node, no Math.random().
 */
export function generarCodigoRecuperacion(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Hashea el código para guardarlo en `codigos_recuperacion.codigo_hash`:
 * nunca se guarda el código en claro, solo su hash, por si alguien
 * llegara a leer la tabla (aunque esté protegida por RLS).
 */
export function hashearCodigoRecuperacion(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

/**
 * Compara el código que ha escrito el cliente con el hash guardado, con
 * una comparación de tiempo constante para no dar pistas por timing.
 * Nunca lanza (un código con formato raro simplemente no coincide).
 */
export function codigoRecuperacionCoincide(codigoIntroducido: string, hashGuardado: string): boolean {
  try {
    const hashIntroducido = Buffer.from(hashearCodigoRecuperacion(codigoIntroducido), "hex");
    const hashEsperado = Buffer.from(hashGuardado, "hex");
    if (hashIntroducido.length !== hashEsperado.length) return false;
    return timingSafeEqual(hashIntroducido, hashEsperado);
  } catch {
    return false;
  }
}
