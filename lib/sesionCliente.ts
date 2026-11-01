import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Sesión de CLIENTE sin contraseña (pedido de David, 01/11/2026): al
// reservar como invitado con un teléfono nuevo, o al verificar el
// teléfono con un código, se guarda en el navegador una cookie httpOnly
// firmada con el id del cliente, válida ~1 año. Así la próxima vez se le
// reconoce sin pedirle nada. No caduca al cerrar la app; se borra al
// pulsar "Cerrar sesión".
//
// La firma (HMAC-SHA256) impide que nadie fabrique o edite la cookie para
// hacerse pasar por otro cliente. La clave es CLIENTE_SESSION_SECRET si
// existe, o una derivada de la service role key (que ya es secreta y
// solo vive en el servidor).

import { COOKIE_SESION_CLIENTE, DURACION_SESION_SEGUNDOS, crearValorSesion, leerValorSesion } from "@/lib/firmaSesionCliente";

export { COOKIE_SESION_CLIENTE };

export function ponerCookieSesion(respuesta: NextResponse, clienteId: string) {
  respuesta.cookies.set(COOKIE_SESION_CLIENTE, crearValorSesion(clienteId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_SEGUNDOS,
  });
}

export function borrarCookieSesion(respuesta: NextResponse) {
  respuesta.cookies.set(COOKIE_SESION_CLIENTE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export const CAMPOS_CLIENTE =
  "id, nombre, telefono, email, sede_habitual_id, fecha_nacimiento, grassocoins, grassocoins_resto_centimos, user_id";

export interface ClienteSesion {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  sede_habitual_id: string | null;
  fecha_nacimiento: string | null;
  grassocoins: number | null;
  grassocoins_resto_centimos: number | null;
  user_id: string | null;
}

/**
 * El cliente reconocido en este navegador, o null. Primero la cookie de
 * invitado; si no, la sesión antigua de Supabase Auth (clientes que
 * entraron con contraseña). `userId` solo existe en el segundo caso.
 */
export async function obtenerClienteActual(): Promise<{ cliente: ClienteSesion; userId: string | null } | null> {
  const almacen = await cookies();
  const idInvitado = leerValorSesion(almacen.get(COOKIE_SESION_CLIENTE)?.value);
  if (idInvitado) {
    const { data } = await createAdminClient().from("clientes").select(CAMPOS_CLIENTE).eq("id", idInvitado).maybeSingle();
    if (data) return { cliente: data as ClienteSesion, userId: (data as ClienteSesion).user_id ?? null };
  }

  // Sin cookie de Supabase ni se le pregunta (ahorra una llamada de red).
  const tieneSesionSupabase = almacen.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!tieneSesionSupabase) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("clientes").select(CAMPOS_CLIENTE).eq("user_id", user.id).maybeSingle();
  return data ? { cliente: data as ClienteSesion, userId: user.id } : null;
}
