import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { seSolapanRangos } from "@/lib/vacaciones";

export const dynamic = "force-dynamic";

// Aprobar o rechazar una solicitud pendiente. Solo el rol "admin".
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let sesion;
  try {
    sesion = await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { admin } = sesion;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (body?.estado !== "aprobada" && body?.estado !== "rechazada") {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: solicitud } = await supabase.from("solicitudes_vacaciones").select("*").eq("id", id).single();
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  if (solicitud.estado !== "pendiente") {
    return NextResponse.json({ error: "Esta solicitud ya estaba resuelta." }, { status: 409 });
  }

  // Al aprobar, se vuelve a comprobar que ningún otro barbero haya
  // quedado de vacaciones esas mismas fechas mientras esta solicitud
  // seguía pendiente (pudo aprobarse otra solapada mientras tanto).
  if (body.estado === "aprobada") {
    const { data: solapadas } = await supabase
      .from("solicitudes_vacaciones")
      .select("id, profesional_id, fecha_inicio, fecha_fin, profesional:profesionales(nombre)")
      .eq("estado", "aprobada")
      .neq("id", id)
      .lte("fecha_inicio", solicitud.fecha_fin)
      .gte("fecha_fin", solicitud.fecha_inicio);
    const conflicto = (solapadas ?? []).find(
      (s) => s.profesional_id !== solicitud.profesional_id && seSolapanRangos(solicitud, { inicio: s.fecha_inicio, fin: s.fecha_fin })
    );
    if (conflicto) {
      const profesionalConflicto = Array.isArray(conflicto.profesional) ? conflicto.profesional[0] : conflicto.profesional;
      const nombreConflicto = (profesionalConflicto as { nombre: string } | null)?.nombre;
      return NextResponse.json(
        { error: `No se puede aprobar: se solapa con las vacaciones ya aprobadas de ${nombreConflicto || "otro barbero"}.` },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase
    .from("solicitudes_vacaciones")
    .update({ estado: body.estado, resuelto_por: admin.id, resuelto_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar la solicitud." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Elimina/retira una solicitud. El propio barbero puede retirar SOLO las
// suyas y SOLO si siguen pendientes; el admin puede borrar cualquiera en
// cualquier estado (por ejemplo, para deshacer un error).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let sesion;
  try {
    sesion = await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { admin } = sesion;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: solicitud } = await supabase.from("solicitudes_vacaciones").select("*").eq("id", id).single();
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

  const esAdmin = admin.rol === "admin";
  if (!esAdmin) {
    if (solicitud.profesional_id !== admin.profesional_id) {
      return NextResponse.json({ error: "No puedes retirar la solicitud de otro barbero." }, { status: 403 });
    }
    if (solicitud.estado !== "pendiente") {
      return NextResponse.json({ error: "Ya está resuelta; pídeselo al admin si hay que deshacerla." }, { status: 409 });
    }
  }

  const { error } = await supabase.from("solicitudes_vacaciones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo eliminar la solicitud." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
