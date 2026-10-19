import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Actualiza el checklist de "normas y servicios del local" de una sede
// (tarjetas, accesibilidad, wifi, apto para niños) — ver migración
// anadir-normas-servicios-sede.sql. Pensado para la pestaña "Sedes" de
// /admin/mi-barberia (comparación con Booksy, pedido de Diego
// 19/10/2026). Solo esos cuatro campos son editables aquí a propósito:
// nombre/dirección/teléfono/maps_url de una sede siguen siendo cosa de
// Diego por Supabase directamente, no hace falta exponerlos en el panel.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const campos: Record<string, unknown> = {};
  for (const clave of ["acepta_tarjeta", "acceso_movilidad_reducida", "wifi", "apto_ninos"]) {
    if (clave in body) campos[clave] = Boolean(body[clave]);
  }
  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "No hay campos que actualizar." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: sede, error } = await supabase
    .from("sedes")
    .update(campos)
    .eq("id", id)
    .select("id, nombre, acepta_tarjeta, acceso_movilidad_reducida, wifi, apto_ninos")
    .single();

  if (error || !sede) {
    return NextResponse.json({ error: "No se pudo actualizar la sede." }, { status: 400 });
  }
  return NextResponse.json({ sede });
}
