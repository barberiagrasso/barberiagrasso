import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono, telefonoValido } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";
import { registrarError } from "@/lib/errorLog";
import { generarCodigoRecuperacion, hashearCodigoRecuperacion, MINUTOS_VALIDEZ_CODIGO } from "@/lib/recuperacionPassword";

export const dynamic = "force-dynamic";

// Entrar sin contraseña (01/11/2026): el cliente escribe su teléfono y le
// llega por WhatsApp un código de 6 dígitos (misma plantilla y misma tabla
// de códigos que la recuperación de contraseña). Vale para cualquier
// cliente con ficha, tenga o no contraseña. La respuesta es siempre la
// misma, exista o no el teléfono, para no revelar quién es cliente.
const RESPUESTA_GENERICA = {
  ok: true,
  mensaje: "Si ese número ha reservado con nosotros, te hemos enviado un código de 6 dígitos por WhatsApp.",
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefono = normalizarTelefono(typeof body?.telefono === "string" ? body.telefono : "");
  if (!telefonoValido(telefono)) return NextResponse.json({ error: "Revisa el teléfono." }, { status: 400 });

  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`codigo:tel:${telefono}`, { maxIntentos: 3, ventanaMinutos: 60 }),
    comprobarLimite(`codigo:ip:${ipDePeticion(request)}`, { maxIntentos: 10, ventanaMinutos: 60 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });

  const admin = createAdminClient();
  const { data: cliente } = await admin.from("clientes").select("id, nombre, telefono").eq("telefono", telefono).maybeSingle();
  if (!cliente) return NextResponse.json(RESPUESTA_GENERICA);

  const { data: plantilla } = await admin
    .from("plantillas_whatsapp")
    .select("*")
    .in("tipo", ["codigo_acceso", "recuperacion_password"])
    .eq("activa", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!plantilla) {
    await registrarError({
      origen: "recuperacion_password",
      mensaje: `${cliente.nombre ?? "Un cliente"} pidió un código para entrar, pero no hay ninguna plantilla de WhatsApp de código activa en /admin/plantillas.`,
    });
    return NextResponse.json(RESPUESTA_GENERICA);
  }

  const codigo = generarCodigoRecuperacion();
  await admin.from("codigos_recuperacion").delete().eq("cliente_id", cliente.id).is("usado_at", null);
  const { error: errorInsertar } = await admin.from("codigos_recuperacion").insert({
    cliente_id: cliente.id,
    codigo_hash: hashearCodigoRecuperacion(codigo),
    expira_at: new Date(Date.now() + MINUTOS_VALIDEZ_CODIGO * 60_000).toISOString(),
  });
  if (errorInsertar) {
    await registrarError({ origen: "recuperacion_password", mensaje: "No se pudo guardar un código de acceso.", detalle: errorInsertar });
    return NextResponse.json(RESPUESTA_GENERICA);
  }

  try {
    const variables = resolverVariablesPlantilla(plantilla.variables ?? [], { nombre: cliente.nombre ?? "", codigo });
    await sendWhatsAppTemplate(cliente.telefono, plantilla.nombre_meta, plantilla.idioma, variables);
  } catch (err) {
    await registrarError({ origen: "recuperacion_password", mensaje: `No se pudo mandar por WhatsApp el código de acceso a ${cliente.nombre ?? "un cliente"}.`, detalle: err });
  }
  return NextResponse.json(RESPUESTA_GENERICA);
}
