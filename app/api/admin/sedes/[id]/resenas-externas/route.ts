import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { limpiarUrl } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

function nota(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 5 ? Math.round(n * 10) / 10 : null;
}

function total(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Guarda la nota, el nº de reseñas y los enlaces de Booksy y Google de una
 * sede (Mi barbería → Sedes). Solo rol "admin".
 * Cuerpo: { booksy: { url, nota, total }, google: { url, url_escribir, nota, total } }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const filas = (["booksy", "google"] as const).map((fuente) => {
    const datos = body[fuente] ?? {};
    return {
      sede_id: id,
      fuente,
      url: limpiarUrl(datos.url),
      url_escribir: fuente === "google" ? limpiarUrl(datos.url_escribir) : null,
      nota: nota(datos.nota),
      total: total(datos.total),
      updated_at: new Date().toISOString(),
    };
  });

  const supabase = createAdminClient();
  const { error } = await supabase.from("sede_resenas_externas").upsert(filas, { onConflict: "sede_id,fuente" });
  if (error) {
    return NextResponse.json(
      { error: "No se pudo guardar. ¿Has ejecutado el script del portafolio en Supabase?" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, filas });
}
