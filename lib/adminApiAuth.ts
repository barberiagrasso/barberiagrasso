import "server-only";
import { createClient } from "@/lib/supabase/server";

export class NoAutorizadoError extends Error {}

/**
 * Igual que requireAdmin() pero pensado para Route Handlers (app/api/...):
 * en vez de redirigir, lanza un error que la propia ruta convierte en un
 * 401/403 JSON.
 */
export async function requireAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new NoAutorizadoError("No has iniciado sesión.");

  const { data: admin } = await supabase.from("admins").select("id, nombre").eq("id", user.id).maybeSingle();
  if (!admin) throw new NoAutorizadoError("Tu usuario no tiene permisos de administrador.");

  return { user, admin };
}
