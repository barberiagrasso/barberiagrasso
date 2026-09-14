import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { resolverSegmento } from "@/lib/segmentacion";
import type { SegmentoCampana } from "@/lib/types";

export const dynamic = "force-dynamic";

// Solo cuenta y previsualiza a quién llegaría una campaña con estos
// filtros; no crea nada. Se usa mientras Diego va ajustando el segmento
// en el panel, antes de decidirse a guardarlo.
export async function POST(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const segmento = (await request.json().catch(() => ({}))) as SegmentoCampana;
  const clientes = await resolverSegmento(segmento);
  return NextResponse.json({ total: clientes.length, muestra: clientes.slice(0, 8).map((c) => c.nombre) });
}
