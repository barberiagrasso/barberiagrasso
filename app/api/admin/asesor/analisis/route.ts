import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errorLog";
import { recomendarEstilo } from "@/lib/visagismo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Visagismo para el equipo: mismo análisis que "Descubre tu estilo" pero
// sin el límite por IP (en la barbería todos comparten la misma conexión).
export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  const imagen = typeof body?.imagenBase64 === "string" ? body.imagenBase64 : "";
  if (!body?.consentimiento) return NextResponse.json({ error: "Confirma que el cliente acepta usar su foto con la IA." }, { status: 400 });
  if (!imagen || imagen.length > 4_000_000) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });

  const { data: servicios } = await createAdminClient().from("servicios").select("id, nombre").eq("activo", true).order("orden");
  try {
    const r = await recomendarEstilo(imagen, {}, servicios ?? []);
    return NextResponse.json(r);
  } catch (err) {
    await registrarError({ origen: "asesor_estilo", mensaje: "Falló el visagismo del panel.", detalle: err instanceof Error ? err.message : "error" });
    return NextResponse.json({ error: "No se ha podido analizar la foto." }, { status: 502 });
  }
}
