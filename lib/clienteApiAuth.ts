import "server-only";
import { createClient } from "@/lib/supabase/server";

export class NoAutorizadoError extends Error {}

/**
 * Igual que requireCliente() pero pensado para Route Handlers
 * (app/api/...): en vez de redirigir a /acceso, lanza un error que la
 * propia ruta convierte en un 401 JSON.
 */
export async function requireClienteApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new NoAutorizadoError("No has iniciado sesión.");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, sede_habitual_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cliente) throw new NoAutorizadoError("Tu cuenta no tiene ficha de cliente enlazada.");

  return { user, cliente };
}
