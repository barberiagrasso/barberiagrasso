import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Comprueba que hay una sesión de administrador válida (usuario logueado
 * en Supabase Auth Y presente en la tabla `admins`). Si no la hay,
 * redirige al login. Úsalo al principio de cualquier página o layout
 * bajo /admin.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: admin } = await supabase.from("admins").select("id, nombre").eq("id", user.id).maybeSingle();

  if (!admin) {
    redirect("/admin/login?error=no-autorizado");
  }

  return { user, admin, supabase };
}
