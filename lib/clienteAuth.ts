import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Exige que haya una sesión de CLIENTE (no de administrador) válida: un
 * usuario de Supabase Auth con una fila enlazada en `clientes`
 * (clientes.user_id). Si no la hay, manda a /acceso. Úsalo al principio
 * de cualquier página orientada al cliente final (portada, reserva,
 * perfil) — la sesión, una vez iniciada, no caduca sola: solo se cierra
 * si el propio cliente pulsa "Cerrar sesión".
 */
export async function requireCliente() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/acceso");
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, sede_habitual_id, fecha_nacimiento, saldo_fidelizacion_centimos")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cliente) {
    redirect("/acceso");
  }

  return { user, cliente, supabase };
}
