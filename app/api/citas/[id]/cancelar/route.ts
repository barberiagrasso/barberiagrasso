import { NextRequest, NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelarCita, ReservaError } from "@/lib/booking";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Deja que un cliente cancele una cita SUYA (nunca la de otro cliente)
// desde "Mi perfil". Al cambiar el estado a "cancelada" se refleja al
// momento tanto en la agenda del panel como en el historial del CRM,
// porque las dos pantallas leen de esta misma tabla `citas` — y el
// hueco vuelve a quedar libre para que otro cliente lo reserve.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let cliente;
  try {
    ({ cliente } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
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
    return NextResponse.json({ error: "Esta cita ya no se puede cancelar." }, { status: 409 });
  }
  if (new Date(cita.inicio).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Esta cita ya ha pasado y no se puede cancelar." }, { status: 409 });
  }

  // cancelarCita (lib/booking.ts) hace también la sincronización con
  // HubSpot y avisa a la lista de espera si alguien pidió ese mismo día.
  try {
    await cancelarCita(id);
  } catch (err) {
    if (err instanceof ReservaError) {
      await registrarError({ origen: "cancelacion", mensaje: `Fallo cancelando la cita ${id}`, detalle: err });
      return NextResponse.json({ error: "No se pudo cancelar la cita. Inténtalo de nuevo." }, { status: 500 });
    }
    // Un error inesperado (no ReservaError) se relanza a propósito: lo
    // recoge la red de seguridad global de instrumentation.ts, para no
    // registrarlo dos veces.
    throw err;
  }

  return NextResponse.json({ ok: true });
}
