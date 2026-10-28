import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAuditoria } from "@/lib/auditoria";
import { HORARIOS_BOOKSY, emparejarSede } from "@/lib/horariosBooksy";

export const dynamic = "force-dynamic";

// Aplica los horarios copiados de Booksy (lib/horariosBooksy.ts) a los
// barberos que el dueño haya emparejado en /admin/importar-horarios.
// Por cada barbero y sede: lo da de alta en esa sede si no lo estaba y
// sustituye su horario de esa sede (igual que guardarlo a mano en Equipo).
export async function POST(request: NextRequest) {
  let admin: Awaited<ReturnType<typeof requireRolAdminApi>>["admin"];
  try {
    ({ admin } = await requireRolAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const asignaciones = (Array.isArray(body?.asignaciones) ? body.asignaciones : []) as { clave: string; profesionalId: string }[];
  if (asignaciones.length === 0) return NextResponse.json({ error: "No hay ningún barbero elegido." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: sedes } = await supabase.from("sedes").select("id, nombre");
  const { data: profesionales } = await supabase.from("profesionales").select("id");
  const idsValidos = new Set((profesionales ?? []).map((p) => p.id));

  const hechos: string[] = [];
  for (const a of asignaciones) {
    const horario = HORARIOS_BOOKSY.find((h) => h.clave === a.clave);
    const sedeId = horario ? emparejarSede(horario.sede, sedes ?? []) : null;
    if (!horario || !sedeId || !idsValidos.has(a.profesionalId)) {
      return NextResponse.json({ error: `No se pudo aplicar el horario de ${horario?.nombre ?? a.clave}.` }, { status: 400 });
    }

    const { data: yaEnSede } = await supabase
      .from("profesional_sedes")
      .select("profesional_id")
      .eq("profesional_id", a.profesionalId)
      .eq("sede_id", sedeId)
      .maybeSingle();
    if (!yaEnSede) {
      const { error } = await supabase.from("profesional_sedes").insert({ profesional_id: a.profesionalId, sede_id: sedeId });
      if (error) return NextResponse.json({ error: `No se pudo dar de alta a ${horario.nombre} en la sede.` }, { status: 500 });
    }

    const { error: errorBorrar } = await supabase.from("horarios").delete().eq("profesional_id", a.profesionalId).eq("sede_id", sedeId);
    if (errorBorrar) return NextResponse.json({ error: `No se pudo cambiar el horario de ${horario.nombre}.` }, { status: 500 });
    const { error } = await supabase.from("horarios").insert(
      horario.turnos.map((t) => ({
        profesional_id: a.profesionalId,
        sede_id: sedeId,
        dia_semana: t.dia,
        hora_inicio: t.inicio,
        hora_fin: t.fin,
        descanso_inicio: t.descanso?.[0] ?? null,
        descanso_fin: t.descanso?.[1] ?? null,
      })),
    );
    if (error) return NextResponse.json({ error: `No se pudo guardar el horario de ${horario.nombre}.` }, { status: 500 });
    hechos.push(horario.clave);
  }

  await registrarAuditoria({
    adminId: admin.id,
    adminNombre: admin.nombre ?? "—",
    accion: "importar_horarios_booksy",
    entidad: "horarios",
    detalle: { horarios: hechos },
  });
  return NextResponse.json({ ok: true, aplicados: hechos });
}
