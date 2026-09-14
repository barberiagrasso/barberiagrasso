import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSinteticoParaTelefono, normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { codigoRecuperacionCoincide, MAX_INTENTOS_CODIGO } from "@/lib/recuperacionPassword";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Mismo mensaje para "el código no existe", "ha caducado", "ya se usó",
// "se agotaron los intentos" y "no coincide": no hay ningún motivo para
// que el cliente (ni nadie probando suerte) distinga un caso de otro.
const ERROR_CODIGO = { error: "Código incorrecto o caducado. Pide uno nuevo." };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefonoBruto = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";
  const passwordNueva = typeof body?.passwordNueva === "string" ? body.passwordNueva : "";

  if (!telefonoBruto || !codigo) {
    return NextResponse.json({ error: "Faltan el teléfono y el código." }, { status: 400 });
  }
  if (passwordNueva.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const telefono = normalizarTelefono(telefonoBruto);

  // Mismos límites que el login: por teléfono (alguien probando códigos
  // contra una cuenta) y por IP (probando muchos teléfonos distintos).
  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`recuperar-confirmar:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 15 }),
    comprobarLimite(`recuperar-confirmar:ip:${ipDePeticion(request)}`, { maxIntentos: 30, ventanaMinutos: 15 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const admin = createAdminClient();

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nombre, user_id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (!cliente?.user_id) {
    return NextResponse.json(ERROR_CODIGO, { status: 401 });
  }

  const { data: registro } = await admin
    .from("codigos_recuperacion")
    .select("id, codigo_hash, intentos, expira_at, usado_at")
    .eq("cliente_id", cliente.id)
    .is("usado_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!registro || new Date(registro.expira_at) < new Date() || registro.intentos >= MAX_INTENTOS_CODIGO) {
    return NextResponse.json(ERROR_CODIGO, { status: 401 });
  }

  if (!codigoRecuperacionCoincide(codigo, registro.codigo_hash)) {
    await admin.from("codigos_recuperacion").update({ intentos: registro.intentos + 1 }).eq("id", registro.id);
    return NextResponse.json(ERROR_CODIGO, { status: 401 });
  }

  // Código correcto: lo marcamos usado ANTES de tocar la contraseña,
  // para que no se pueda reutilizar aunque algo falle después.
  await admin.from("codigos_recuperacion").update({ usado_at: new Date().toISOString() }).eq("id", registro.id);

  const { error: errorPassword } = await admin.auth.admin.updateUserById(cliente.user_id, { password: passwordNueva });
  if (errorPassword) {
    await registrarError({
      origen: "recuperacion_password",
      mensaje: `No se pudo actualizar la contraseña de ${cliente.nombre ?? "un cliente"} tras verificar el código.`,
      detalle: errorPassword,
    });
    return NextResponse.json({ error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." }, { status: 500 });
  }

  // Inicia sesión directamente, igual que en el registro, para que el
  // cliente no tenga que volver a escribir la contraseña que acaba de
  // elegir.
  const supabase = await createClient();
  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: emailSinteticoParaTelefono(telefono),
    password: passwordNueva,
  });
  if (errorSesion) {
    return NextResponse.json({ ok: true, sesionIniciada: false });
  }

  return NextResponse.json({ ok: true, sesionIniciada: true });
}
