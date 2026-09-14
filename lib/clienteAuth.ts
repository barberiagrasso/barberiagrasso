import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";

/**
 * Exige que haya una sesión de CLIENTE (no de administrador) válida: un
 * usuario de Supabase Auth con una fila enlazada en `clientes`
 * (clientes.user_id). Si no la hay, manda a /acceso conservando la ruta
 * que se había pedido de verdad (leída de la cabecera que deja
 * proxy.ts) como `?next=`, para que al loguearse vuelva ahí en vez de
 * siempre a la home. Sin esto, un enlace directo a /perfil sin sesión
 * iniciada te dejaba tirado en la portada después de entrar, no en
 * /perfil. Úsalo al principio de cualquier página orientada al cliente
 * final (portada, reserva, perfil) — la sesión, una vez iniciada, no
 * caduca sola: solo se cierra si el propio cliente pulsa "Cerrar
 * sesión".
 */
export async function requireCliente() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Calculado siempre (no solo si hace falta redirigir) para que la
  // llamada a redirect() de cada `if` de abajo quede como una
  // instrucción síncrona y directa — así TypeScript sigue pudiendo
  // deducir que `user`/`cliente` ya no son null después de cada
  // comprobación, igual que hacía con el redirect() plano de antes.
  const pathnamePedido = (await headers()).get("x-pathname");
  const next = rutaSiguienteSegura(pathnamePedido, "/");
  const destinoAcceso = next === "/" ? "/acceso" : `/acceso?next=${encodeURIComponent(next)}`;

  if (!user) {
    redirect(destinoAcceso);
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, sede_habitual_id, fecha_nacimiento, saldo_fidelizacion_centimos")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cliente) {
    redirect(destinoAcceso);
  }

  return { user, cliente, supabase };
}
