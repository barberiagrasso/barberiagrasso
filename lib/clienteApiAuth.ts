import "server-only";
import { obtenerClienteActual } from "@/lib/sesionCliente";

export class NoAutorizadoError extends Error {}

/**
 * Igual que requireCliente() pero para Route Handlers (app/api/...): en
 * vez de redirigir a /acceso, lanza un error que la ruta convierte en 401.
 * `user` solo existe si el cliente entró con contraseña (Supabase Auth).
 */
export async function requireClienteApi() {
  const actual = await obtenerClienteActual();
  if (!actual) throw new NoAutorizadoError("No has iniciado sesión.");
  return { cliente: actual.cliente, user: actual.userId ? { id: actual.userId } : null };
}
