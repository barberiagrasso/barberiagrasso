import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarOCrearCliente, emailSinteticoParaTelefono, normalizarTelefono } from "@/lib/clientes";
import { sincronizarClienteHubSpot } from "@/lib/hubspot";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Crea la cuenta de un cliente (teléfono + contraseña) y la enlaza con
// su ficha del CRM. Si ya existía una ficha con ese teléfono — porque lo
// dimos de alta a mano al llamar por teléfono, o porque ya había
// reservado antes desde la web sin cuenta — se enlaza a ESA ficha en vez
// de crear una nueva, así el cliente ve de golpe todo su historial
// anterior en cuanto se registra.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const telefonoBruto = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim() : null;

  if (!nombre || !telefonoBruto || !password) {
    return NextResponse.json({ error: "Faltan datos: nombre, teléfono y contraseña." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  // Frena altas masivas de cuentas falsas desde el mismo sitio.
  const limite = await comprobarLimite(`registro:ip:${ipDePeticion(request)}`, { maxIntentos: 6, ventanaMinutos: 60 });
  if (!limite.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const telefono = normalizarTelefono(telefonoBruto);
  const admin = createAdminClient();

  const { data: clienteExistente } = await admin
    .from("clientes")
    .select("id, user_id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (clienteExistente?.user_id) {
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese número de teléfono. Inicia sesión en su lugar." },
      { status: 409 }
    );
  }

  const emailSintetico = emailSinteticoParaTelefono(telefono);
  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: emailSintetico,
    password,
    email_confirm: true,
    user_metadata: { nombre, telefono },
  });

  if (errorAuth || !nuevoUsuario?.user) {
    const yaRegistrado = errorAuth?.message?.toLowerCase().includes("already");
    return NextResponse.json(
      { error: yaRegistrado ? "Ya existe una cuenta con ese número. Inicia sesión." : "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: yaRegistrado ? 409 : 500 }
    );
  }

  // Enlaza (o crea) la ficha de cliente del CRM con la cuenta recién creada.
  let clienteId: string;
  try {
    ({ clienteId } = await buscarOCrearCliente(admin, { nombre, telefono, email }));
  } catch {
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: "No se pudo registrar el cliente." }, { status: 500 });
  }

  const { error: errorLink } = await admin
    .from("clientes")
    .update({ user_id: nuevoUsuario.user.id, nombre, ...(email ? { email } : {}) })
    .eq("id", clienteId);

  if (errorLink) {
    // No dejar un usuario de Auth huérfano sin ficha de cliente enlazada.
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: "No se pudo completar el registro." }, { status: 500 });
  }

  // Copia esta nueva cuenta a HubSpot como Contacto (nunca bloquea el
  // registro si HubSpot falla).
  await sincronizarClienteHubSpot(admin, clienteId);

  // Avisa por WhatsApp de que la cuenta ya está creada. Es un mensaje que
  // inicia el negocio sin que el cliente haya escrito antes, así que hace
  // falta una plantilla aprobada por Meta (ver /admin/plantillas, tipo
  // "bienvenida"). Nunca bloquea el registro: si no hay plantilla
  // configurada, o el envío falla, simplemente se registra el error para
  // que Diego lo vea en /admin/errores.
  await avisarAltaCliente(admin, { nombre, telefono });

  // Inicia la sesión de verdad (deja la cookie puesta) con el cliente
  // normal, no con el de servicio.
  const supabase = await createClient();
  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: emailSintetico,
    password,
  });
  if (errorSesion) {
    return NextResponse.json(
      { error: "Cuenta creada, pero no se pudo iniciar sesión automáticamente. Prueba a entrar." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

async function avisarAltaCliente(
  admin: ReturnType<typeof createAdminClient>,
  { nombre, telefono }: { nombre: string; telefono: string }
) {
  try {
    const { data: plantilla } = await admin
      .from("plantillas_whatsapp")
      .select("*")
      .eq("tipo", "bienvenida")
      .eq("activa", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (!plantilla) {
      // No es un error de verdad: simplemente Diego no ha registrado
      // todavía la plantilla de bienvenida en /admin/plantillas.
      return;
    }

    const variables = resolverVariablesPlantilla(plantilla.variables ?? [], { nombre, telefono });
    await sendWhatsAppTemplate(telefono, plantilla.nombre_meta, plantilla.idioma, variables);
  } catch (err) {
    await registrarError({
      origen: "aviso_alta",
      mensaje: `No se pudo avisar por WhatsApp a ${nombre} de que su cuenta ya está creada.`,
      detalle: err,
    });
  }
}
