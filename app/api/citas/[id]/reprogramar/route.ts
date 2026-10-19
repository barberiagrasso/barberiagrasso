import { NextRequest, NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reprogramarCita, ReservaError } from "@/lib/booking";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Deja que un cliente cambie la hora de una cita SUYA (nunca la de otro
// cliente) desde "Mi perfil" sin tener que cancelarla y perder el hueco —
// pedido de Diego (03/10/2026): antes de cancelar definitivamente, debe
// poder modificarla dentro del horario disponible (ver "Cambiar hora" en
// HistorialCitas.tsx). Vuelve a comprobar que el hueco pedido sigue libre
// (reprogramarCita ya lo hace, igual que al crear una cita) para evitar
// dobles reservas.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let cliente;
  try {
    ({ cliente } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const horaInicioISO = typeof body?.horaInicioISO === "string" ? body.horaInicioISO : null;
  // Solo se respeta si el cliente ya había elegido expresamente ese
  // profesional (ver profesionalId en CitaNormalizada/app/perfil/page.tsx);
  // si no, se manda null para que reprogramarCita busque entre "cualquiera"
  // en vez de atarse sin querer al barbero que le tocó la vez anterior.
  const profesionalId = typeof body?.profesionalId === "string" ? body.profesionalId : null;
  if (!horaInicioISO) {
    return NextResponse.json({ error: "Falta la nueva hora." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cita } = await admin
    .from("citas")
    .select("id, cliente_id, estado, inicio")
    .eq("id", id)
    .maybeSingle();

  if (!cita || cita.cliente_id !== cliente.id) {
    return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  }
  if (cita.estado !== "confirmada") {
    return NextResponse.json({ error: "Esta cita ya no se puede modificar." }, { status: 409 });
  }
  if (new Date(cita.inicio).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Esta cita ya ha pasado y no se puede modificar." }, { status: 409 });
  }

  try {
    const { cita: citaActualizada, profesionalNombre } = await reprogramarCita({
      citaId: id,
      nuevaHoraInicioISO: horaInicioISO,
      profesionalId,
    });
    return NextResponse.json({ cita: citaActualizada, profesionalNombre });
  } catch (err) {
    if (err instanceof ReservaError) {
      await registrarError({ origen: "reprogramacion", mensaje: `Fallo reprogramando la cita ${id}`, detalle: err });
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Un error inesperado (no ReservaError) se relanza a propósito: lo
    // recoge la red de seguridad global de instrumentation.ts, igual que
    // en /api/citas/[id]/cancelar.
    throw err;
  }
}
