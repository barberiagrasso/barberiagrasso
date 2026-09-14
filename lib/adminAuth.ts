import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Comprueba que hay una sesión de administrador válida (usuario logueado
 * en Supabase Auth Y presente en la tabla `admins`). Si no la hay,
 * redirige al login. Úsalo al principio de cualquier página o layout
 * bajo /admin.
 *
 * Si la cuenta tiene pendiente el cambio obligatorio de contraseña
 * (`debe_cambiar_password`), redirige a /admin/cambiar-password antes de
 * dejar pasar a cualquier otra pantalla — así una cuenta de equipo recién
 * creada no puede quedarse usando la contraseña por defecto sin querer.
 * La propia pantalla de cambio de contraseña pasa
 * `saltarCambioObligatorio: true` para no entrar en un bucle.
 */
export async function requireAdmin(opciones?: { saltarCambioObligatorio?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("id, nombre, rol, profesional_id, debe_cambiar_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!admin) {
    redirect("/admin/login?error=no-autorizado");
  }

  if (admin.debe_cambiar_password && !opciones?.saltarCambioObligatorio) {
    redirect("/admin/cambiar-password");
  }

  return { user, admin, supabase };
}

/**
 * Igual que requireAdmin(), pero además exige rol "admin": para las
 * pantallas que un barbero no debe poder ver (Equipo, Campañas,
 * Plantillas, Informes). Si la cuenta es de rol "barbero", la manda de
 * vuelta a la Agenda en vez de enseñarle un error.
 */
export async function requireRolAdmin() {
  const { user, admin, supabase } = await requireAdmin();
  if (admin.rol !== "admin") {
    redirect("/admin/dashboard");
  }
  return { user, admin, supabase };
}
