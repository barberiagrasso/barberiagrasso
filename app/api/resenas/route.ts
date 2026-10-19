import { NextRequest, NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Deja que un cliente valore con estrellas (1-5) y un comentario opcional
// una cita SUYA ya completada — comparación con Booksy, pedido de Diego
// 19/10/2026. Una sola valoración por cita (constraint unique en
// resenas.cita_id): si ya la valoró, se rechaza en vez de dejar
// duplicar o pisar la anterior.
export async function POST(request: NextRequest) {
  let cliente;
  try {
    ({ cliente } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const citaId = typeof body?.citaId === "string" ? body.citaId : null;
  const estrellas = Number(body?.estrellas);
  const comentario = typeof body?.comentario === "string" ? body.comentario.trim().slice(0, 1000) || null : null;

  if (!citaId || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return NextResponse.json({ error: "Faltan datos válidos para la valoración." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cita } = await admin
    .from("citas")
    .select("id, cliente_id, estado, sede_id, profesional_id")
    .eq("id", citaId)
    .maybeSingle();

  if (!cita || cita.cliente_id !== cliente.id) {
    return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  }
  if (cita.estado !== "completada") {
    return NextResponse.json({ error: "Solo se pueden valorar citas ya completadas." }, { status: 409 });
  }

  const { data: resena, error } = await admin
    .from("resenas")
    .insert({
      cita_id: cita.id,
      cliente_id: cliente.id,
      profesional_id: cita.profesional_id,
      sede_id: cita.sede_id,
      estrellas,
      comentario,
    })
    .select("id, estrellas, comentario")
    .single();

  if (error || !resena) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Ya habías valorado esta cita." }, { status: 409 });
    }
    await registrarError({ origen: "resena", mensaje: `Fallo guardando valoración de la cita ${citaId}`, detalle: error });
    return NextResponse.json({ error: "No se pudo guardar la valoración." }, { status: 500 });
  }

  return NextResponse.json({ resena });
}
