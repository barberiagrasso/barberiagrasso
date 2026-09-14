import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverSegmento } from "@/lib/segmentacion";
import type { SegmentoCampana } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const supabase = createAdminClient();
  const { data: campanas, error } = await supabase
    .from("campanas")
    .select("*, plantilla:plantillas_whatsapp(nombre, nombre_meta, activa)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No se pudieron cargar las campañas." }, { status: 500 });

  const ids = (campanas ?? []).map((c) => c.id);
  const { data: destinatarios } = await supabase
    .from("campana_destinatarios")
    .select("campana_id, estado")
    .in("campana_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const conteos = new Map<string, { total: number; enviados: number; fallidos: number }>();
  for (const d of destinatarios ?? []) {
    const actual = conteos.get(d.campana_id) ?? { total: 0, enviados: 0, fallidos: 0 };
    actual.total += 1;
    if (d.estado === "enviado") actual.enviados += 1;
    if (d.estado === "fallido") actual.fallidos += 1;
    conteos.set(d.campana_id, actual);
  }

  const resultado = (campanas ?? []).map((c) => ({ ...c, destinatarios: conteos.get(c.id) ?? { total: 0, enviados: 0, fallidos: 0 } }));
  return NextResponse.json({ campanas: resultado });
}

// Crea la campaña como borrador y calcula (y congela) su lista de
// destinatarios en ese momento, a partir del segmento indicado. Si
// quieres actualizar a quién llegaría, crea una campaña nueva: así el
// historial de una campaña ya enviada no cambia con el tiempo.
export async function POST(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  if (!body?.nombre || !body?.mensaje) {
    return NextResponse.json({ error: "Faltan nombre y mensaje." }, { status: 400 });
  }
  const segmento: SegmentoCampana = body.segmento ?? {};
  const clientes = await resolverSegmento(segmento);
  if (clientes.length === 0) {
    return NextResponse.json({ error: "Ese segmento no incluye a ningún cliente con consentimiento comercial." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: campana, error } = await supabase
    .from("campanas")
    .insert({
      nombre: body.nombre,
      canal: "whatsapp",
      mensaje: body.mensaje,
      segmento,
      plantilla_id: body.plantillaId || null,
      estado: "borrador",
    })
    .select("*")
    .single();
  if (error || !campana) return NextResponse.json({ error: "No se pudo crear la campaña." }, { status: 500 });

  const { error: errorDestinatarios } = await supabase
    .from("campana_destinatarios")
    .insert(clientes.map((c) => ({ campana_id: campana.id, cliente_id: c.id, estado: "pendiente" })));
  if (errorDestinatarios) {
    return NextResponse.json({ error: "La campaña se creó pero no se pudo guardar la lista de destinatarios." }, { status: 500 });
  }

  return NextResponse.json({ campana: { ...campana, destinatarios: { total: clientes.length, enviados: 0, fallidos: 0 } } });
}
