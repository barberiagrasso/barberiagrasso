import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";
import { obtenerClienteActual } from "@/lib/sesionCliente";

/**
 * Exige un cliente reconocido en este navegador (cookie de invitado de
 * lib/sesionCliente.ts, o la sesión antigua con contraseña). Si no lo
 * hay, manda a /acceso conservando la ruta pedida como `?next=`.
 * Solo para lo PRIVADO del cliente (perfil, tarjeta). La portada y la
 * reserva ya no la usan: se puede reservar sin cuenta.
 */
export async function requireCliente() {
  const actual = await obtenerClienteActual();
  if (!actual) {
    const pathnamePedido = (await headers()).get("x-pathname");
    const next = rutaSiguienteSegura(pathnamePedido, "/");
    return redirect(next === "/" ? "/acceso" : `/acceso?next=${encodeURIComponent(next)}`);
  }
  return { cliente: actual.cliente, userId: actual.userId };
}
