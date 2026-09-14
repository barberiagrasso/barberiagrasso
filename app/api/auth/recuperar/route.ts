import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";
import { registrarError } from "@/lib/errorLog";
import { generarCodigoRecuperacion, hashearCodigoRecuperacion, MINUTOS_VALIDEZ_CODIGO } from "@/lib/recuperacionPassword";

export const dynamic = "force-dynamic";

// Respuesta SIEMPRE igual, tanto si el teléfono tiene cuenta como si no
// (y tanto si el envío por WhatsApp ha ido bien como si ha fallado): que
// se pudiera distinguir un caso de otro dejaría averiguar, número a
// número, qué teléfonos tienen cuenta en la app.
const RESPUESTA_GENERICA = {
  ok: true,
  mensaje: "Si ese número tiene una cuenta, te hemos enviado un código de 6 dígitos por WhatsApp.",
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefonoBruto = typeof body?.telefono === "string" ? body.telefono.trim() : "";

  if (!telefonoBruto) {
    return NextResponse.json({ error: "Introduce tu teléfono." }, { status: 400 });
  }

  const telefono = normalizarTelefono(telefonoBruto);

  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`recuperar:tel:${telefono}`, { maxIntentos: 3, ventanaMinutos: 60 }),
    comprobarLimite(`recuperar:ip:${ipDePeticion(request)}`, { maxIntentos: 10, ventanaMinutos: 60 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const admin = createAdminClient();

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nombre, telefono, user_id")
    .eq("telefono", telefono)
    .maybeSingle();

  // No hay cuenta con ese teléfono: respondemos igual que si la hubiera,
  // sin mandar nada.
  if (!cliente?.user_id) {
    return NextResponse.json(RESPUESTA_GENERICA);
  }

  const { data: plantilla } = await admin
    .from("plantillas_whatsapp")
    .select("*")
    .eq("tipo", "recuperacion_password")
    .eq("activa", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!plantilla) {
    await registrarError({
      origen: "recuperacion_password",
      mensaje: `${cliente.nombre ?? "Un cliente"} pidió recuperar su contraseña, pero no hay ninguna plantilla de tipo "recuperacion_password" activa en /admin/plantillas.`,
    });
    return NextResponse.json(RESPUESTA_GENERICA);
  }

  const codigo = generarCodigoRecuperacion();
  const expiraAt = new Date(Date.now() + MINUTOS_VALIDEZ_CODIGO * 60_000).toISOString();

  // Invalida cualquier código anterior sin usar, para que solo el
  // último enviado sea válido.
  await admin.from("codigos_recuperacion").delete().eq("cliente_id", cliente.id).is("usado_at", null);

  const { error: errorInsertar } = await admin.from("codigos_recuperacion").insert({
    cliente_id: cliente.id,
    codigo_hash: hashearCodigoRecuperacion(codigo),
    expira_at: expiraAt,
  });

  if (errorInsertar) {
    await registrarError({
      origen: "recuperacion_password",
      mensaje: `No se pudo guardar el código de recuperación de ${cliente.nombre ?? "un cliente"}.`,
      detalle: errorInsertar,
    });
    return NextResponse.json(RESPUESTA_GENERICA);
  }

  try {
    const variables = resolverVariablesPlantilla(plantilla.variables ?? [], {
      nombre: cliente.nombre ?? "",
      codigo,
    });
    await sendWhatsAppTemplate(cliente.telefono, plantilla.nombre_meta, plantilla.idioma, variables);
  } catch (err) {
    await registrarError({
      origen: "recuperacion_password",
      mensaje: `No se pudo mandar por WhatsApp el código de recuperación a ${cliente.nombre ?? "un cliente"}.`,
      detalle: err,
    });
  }

  return NextResponse.json(RESPUESTA_GENERICA);
}
