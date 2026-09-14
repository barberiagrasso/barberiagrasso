import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSinteticoParaUsuarioEquipo, usuarioDesdeNombreProfesional } from "@/lib/usuarioEquipo";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Contraseña con la que se crea (o se resetea) cualquier cuenta de
// equipo — el panel obliga a cambiarla en el siguiente inicio de sesión
// (debe_cambiar_password), así que no hace falta que sea distinta cada
// vez.
const PASSWORD_POR_DEFECTO = "12345";

/**
 * Da de alta el acceso al panel de un barbero (o, si ya lo tenía, se lo
 * restablece a la contraseña por defecto y le vuelve a exigir que la
 * cambie). Solo lo puede hacer una cuenta de rol "admin" — nunca otro
 * barbero.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const profesionalId = typeof body?.profesionalId === "string" ? body.profesionalId : "";
  if (!profesionalId) {
    return NextResponse.json({ error: "Falta el profesional." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profesional } = await admin.from("profesionales").select("id, nombre").eq("id", profesionalId).maybeSingle();
  if (!profesional) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  const { data: cuentaExistente } = await admin
    .from("admins")
    .select("id, usuario")
    .eq("profesional_id", profesionalId)
    .maybeSingle();

  // Ya tenía acceso: no se crea una cuenta nueva, se le resetea la
  // contraseña a la de por defecto y se le vuelve a exigir cambiarla —
  // sirve tanto para "se le ha olvidado" como para renovar el acceso.
  if (cuentaExistente) {
    const { error: errorPassword } = await admin.auth.admin.updateUserById(cuentaExistente.id, {
      password: PASSWORD_POR_DEFECTO,
    });
    if (errorPassword) {
      await registrarError({
        origen: "servidor",
        mensaje: `No se pudo restablecer el acceso de ${profesional.nombre}.`,
        detalle: errorPassword,
      });
      return NextResponse.json({ error: "No se pudo restablecer el acceso." }, { status: 500 });
    }
    await admin.from("admins").update({ debe_cambiar_password: true }).eq("id", cuentaExistente.id);
    return NextResponse.json({
      ok: true,
      reseteado: true,
      usuario: cuentaExistente.usuario,
      passwordTemporal: PASSWORD_POR_DEFECTO,
    });
  }

  // Cuenta nueva: genera un usuario a partir del nombre, y si ya existe
  // (dos profesionales que generarían el mismo usuario base) le añade un
  // número detrás hasta que sea único.
  const { data: usuariosExistentes } = await admin.from("admins").select("usuario");
  const yaUsados = new Set((usuariosExistentes ?? []).map((a) => a.usuario).filter(Boolean));
  const base = usuarioDesdeNombreProfesional(profesional.nombre);
  let usuario = base;
  let sufijo = 2;
  while (yaUsados.has(usuario)) {
    usuario = usuarioDesdeNombreProfesional(profesional.nombre, sufijo);
    sufijo++;
  }

  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: emailSinteticoParaUsuarioEquipo(usuario),
    password: PASSWORD_POR_DEFECTO,
    email_confirm: true,
    user_metadata: { nombre: profesional.nombre, rol: "barbero" },
  });

  if (errorAuth || !nuevoUsuario?.user) {
    await registrarError({
      origen: "servidor",
      mensaje: `No se pudo crear el acceso de ${profesional.nombre}.`,
      detalle: errorAuth,
    });
    return NextResponse.json({ error: "No se pudo crear el acceso." }, { status: 500 });
  }

  const { error: errorFicha } = await admin.from("admins").insert({
    id: nuevoUsuario.user.id,
    nombre: profesional.nombre,
    usuario,
    rol: "barbero",
    profesional_id: profesionalId,
    debe_cambiar_password: true,
  });

  if (errorFicha) {
    // No dejar un usuario de Auth huérfano sin ficha de admins enlazada.
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    await registrarError({
      origen: "servidor",
      mensaje: `No se pudo completar el acceso de ${profesional.nombre}.`,
      detalle: errorFicha,
    });
    return NextResponse.json({ error: "No se pudo crear el acceso." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reseteado: false, usuario, passwordTemporal: PASSWORD_POR_DEFECTO });
}
