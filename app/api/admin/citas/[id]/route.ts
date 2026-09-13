import { NextRequest, NextResponse } from "next/server";
import { addMinutes } from "date-fns";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitaHubSpot } from "@/lib/hubspot";
import { cancelarCita, ReservaError } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const supabase = createAdminClient();

  // Cambiar solo el estado (cancelar, marcar completada / no presentada).
  // La cancelación pasa por lib/booking.ts porque, además de marcar la
  // cita, es la que avisa a la lista de espera si alguien estaba
  // esperando un hueco ese mismo día — igual que cuando cancela la IA
  // por WhatsApp.
  if (body?.estado === "cancelada") {
    try {
      await cancelarCita(id);
    } catch (err) {
      if (err instanceof ReservaError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
    return NextResponse.json({ ok: true });
  }
  if (body?.estado) {
    const { error } = await supabase.from("citas").update({ estado: body.estado }).eq("id", id);
    if (error) return NextResponse.json({ error: "No se pudo actualizar la cita." }, { status: 500 });
    await sincronizarCitaHubSpot(supabase, id);
    return NextResponse.json({ ok: true });
  }

  // Mover la cita a otra hora / otro profesional
  if (body?.horaInicioISO) {
    const { data: citaActual } = await supabase
      .from("citas")
      .select("id, sede_id, servicio_id, profesional_id, servicios(duracion_minutos)")
      .eq("id", id)
      .single();
    if (!citaActual) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });

    const servicioInfo = Array.isArray(citaActual.servicios) ? citaActual.servicios[0] : citaActual.servicios;
    const duracionMinutos = (servicioInfo as { duracion_minutos: number } | null)?.duracion_minutos ?? 30;
    const nuevoProfesionalId = body.profesionalId || citaActual.profesional_id;
    const nuevoInicio = new Date(body.horaInicioISO);
    const nuevoFin = addMinutes(nuevoInicio, duracionMinutos);

    const { data: conflictos } = await supabase
      .from("citas")
      .select("id")
      .eq("profesional_id", nuevoProfesionalId)
      .neq("id", id)
      .neq("estado", "cancelada")
      .lt("inicio", nuevoFin.toISOString())
      .gt("fin", nuevoInicio.toISOString());

    if (conflictos && conflictos.length > 0) {
      return NextResponse.json(
        { error: "Ese profesional ya tiene otra cita a esa hora." },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("citas")
      .update({
        inicio: nuevoInicio.toISOString(),
        fin: nuevoFin.toISOString(),
        profesional_id: nuevoProfesionalId,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "No se pudo mover la cita." }, { status: 500 });
    await sincronizarCitaHubSpot(supabase, id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
}
