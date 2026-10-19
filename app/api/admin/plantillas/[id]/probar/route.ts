import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { normalizarTelefono } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Manda una plantilla a un número de prueba (normalmente el propio
// móvil de Diego) con valores de relleno en cada variable, para
// comprobar que el nombre exacto registrado coincide con el que Meta
// tiene aprobado — ANTES de que falle con un cliente real. Pedido de
// Diego, revisión de paneles (19/10/2026): antes solo se sabía que
// estaba mal cuando fallaba un envío de verdad (y quedaba en Errores).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.telefono) {
    return NextResponse.json({ error: "Falta el número de prueba." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: plantilla } = await supabase
    .from("plantillas_whatsapp")
    .select("nombre_meta, idioma, variables")
    .eq("id", id)
    .maybeSingle();
  if (!plantilla) return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });

  const variablesDePrueba = (plantilla.variables ?? []).map((v: string) => `[${v}]`);

  try {
    await sendWhatsAppTemplate(normalizarTelefono(body.telefono), plantilla.nombre_meta, plantilla.idioma, variablesDePrueba);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Fallo desconocido enviando la plantilla.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
