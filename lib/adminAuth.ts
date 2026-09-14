import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";

/**
 * Comprueba que hay una sesión de administrador válida (usuario logueado
 * en Supabase Auth Y presente en la tabla `admins`). Si no la hay,
 * redirige al login conservando la ruta que se había pedido de verdad
 * (leída de la cabecera que deja proxy.ts) como `?next=`, para volver
 * ahí en cuanto inicie sesión — en vez de mandar siempre al dashboard
 * aunque el enlace original fuera, por ejemplo, a una conversación de
 * WhatsApp o a la ficha de un cliente. Úsalo al principio de cualquier
 * página o layout bajo /admin.
 *
 * Si la cuenta tiene pendiente el cambio obligatorio de contraseña
 * (`debe_cambiar_password`), redirige a /admin/cambiar-password antes de
 * dejar pasar a cualquier otra pantalla — así una cuenta de equipo recién
 * creada no puede quedarse usando la contraseña por defecto sin querer.
 * La propia pantalla de cambio de contraseña pasa
 * `saltarCambioObligatorio: true` para no entrar en un bucle, y también
 * conserva el destino original para volver ahí en cuanto la cambie.
 */
export async function requireAdmin(opciones?: { saltarCambioObligatorio?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Calculado siempre (no solo si hace falta redirigir) para que la
  // llamada a redirect() de cada `if` de abajo quede como una
  // instrucción síncrona y directa — así TypeScript sigue pudiendo
  // deducir que `user`/`admin` ya no son null después de cada
  // comprobación, igual que hacía con el redirect() plano de antes.
  const pathnamePedido = (await headers()).get("x-pathname");
  const next = rutaSiguienteSegura(pathnamePedido, "/admin/dashboard");
  const destinoLogin = next === "/admin/dashboard" ? "/admin/login" : `/admin/login?next=${encodeURIComponent(next)}`;
  const destinoCambiarPassword =
    next === "/admin/dashboard" ? "/admin/cambiar-password" : `/admin/cambiar-password?next=${encodeURIComponent(next)}`;

  if (!user) {
    redirect(destinoLogin);
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
    redirect(destinoCambiarPassword);
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
