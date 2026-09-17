import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { seSolapanRangos } from "@/lib/vacaciones";

export const dynamic = "force-dynamic";

// Lista las solicitudes de vacaciones (cualquier cuenta de equipo puede
// verlas todas — no son un dato tan sensible como para esconder a los
// barberos cuándo está fuera un compañero, y el calendario agregado del
// admin las necesita todas). El filtrado de "qué puede hacer con ellas"
// (aprobar, rechazar, ver solo las suyas) vive en el resto de rutas y en
// el propio cliente.
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const desde = request.nextUrl.searchParams.get("desde"); // YYYY-MM-DD, opcional
  const hasta = request.nextUrl.searchParams.get("hasta");

  let consulta = supabase
    .from("solicitudes_vacaciones")
    .select("id, profesional_id, fecha_inicio, fecha_fin, estado, motivo, solicitado_por, resuelto_en, created_at, profesional:profesionales(nombre)")
    .order("fecha_inicio");
  if (desde) consulta = consulta.gte("fecha_fin", desde);
  if (hasta) consulta = consulta.lte("fecha_inicio", hasta);

  const { data: solicitudes, error } = await consulta;
  if (error) return NextResponse.json({ error: "No se pudieron cargar las vacaciones." }, { status: 500 });

  // Roster completo (no solo quien ya tiene alguna solicitud) para que
  // el filtro "quitar y poner barberos" del calendario del admin los
  // muestre a todos desde el principio, aunque uno aún no haya pedido
  // nada — cruza las dos sedes, como pidió Diego.
  const { data: profesionales } = await supabase.from("profesionales").select("id, nombre").eq("activo", true).order("nombre");

  return NextResponse.json({ solicitudes, profesionales });
}

// Crea una solicitud de vacaciones. Un barbero SOLO puede pedirla para sí
// mismo (se ignora cualquier profesionalId que mande, se usa el de su
// propia cuenta) y siempre queda "pendiente". El admin puede pedirla
// para cualquier profesional y, si manda aprobarDirectamente, queda ya
// aprobada (para cuando el barbero avisa por otro canal).
export async function POST(request: NextRequest) {
  let sesion;
  try {
    sesion = await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { admin } = sesion;

  const body = await request.json().catch(() => null);
  if (!body?.fechaInicio || !body?.fechaFin) {
    return NextResponse.json({ error: "Faltan las fechas de inicio y fin." }, { status: 400 });
  }
  if (body.fechaFin < body.fechaInicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio." }, { status: 400 });
  }

  const esAdmin = admin.rol === "admin";
  const profesionalId: string | null = esAdmin ? body.profesionalId || null : admin.profesional_id;
  if (!profesionalId) {
    return NextResponse.json(
      { error: esAdmin ? "Falta indicar para qué barbero es." : "Tu cuenta no está asociada a ningún barbero." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Días bloqueados por el admin para pedir vacaciones: un barbero no
  // puede saltárselos; el admin sí (es quien decide el bloqueo, puede
  // hacer una excepción él mismo si hace falta).
  if (!esAdmin) {
    const { data: bloqueados } = await supabase
      .from("dias_bloqueados_vacaciones")
      .select("fecha_inicio, fecha_fin")
      .lte("fecha_inicio", body.fechaFin)
      .gte("fecha_fin", body.fechaInicio);
    if (bloqueados && bloqueados.length > 0) {
      return NextResponse.json(
        { error: "Esas fechas están bloqueadas y no se pueden pedir como vacaciones." },
        { status: 409 }
      );
    }
  }

  // Nunca puede haber dos barberos de vacaciones (pendiente o aprobada)
  // el mismo día, sea cual sea su sede — regla explícita de Diego.
  // Tampoco dos solicitudes solapadas del mismo barbero.
  const { data: solapadas } = await supabase
    .from("solicitudes_vacaciones")
    .select("id, profesional_id, fecha_inicio, fecha_fin, estado, profesional:profesionales(nombre)")
    .in("estado", ["pendiente", "aprobada"])
    .lte("fecha_inicio", body.fechaFin)
    .gte("fecha_fin", body.fechaInicio);

  const conflicto = (solapadas ?? []).find((s) =>
    seSolapanRangos(
      { inicio: body.fechaInicio, fin: body.fechaFin },
      { inicio: s.fecha_inicio, fin: s.fecha_fin }
    )
  );
  if (conflicto) {
    const profesionalConflicto = Array.isArray(conflicto.profesional) ? conflicto.profesional[0] : conflicto.profesional;
    const nombreConflicto = (profesionalConflicto as { nombre: string } | null)?.nombre;
    const mismoBarbero = conflicto.profesional_id === profesionalId;
    return NextResponse.json(
      {
        error: mismoBarbero
          ? "Ya hay una solicitud tuya que se solapa con esas fechas."
          : `Esas fechas se solapan con las vacaciones de ${nombreConflicto || "otro barbero"}.`,
      },
      { status: 409 }
    );
  }

  const aprobarDirectamente = esAdmin && Boolean(body.aprobarDirectamente);
  const { data: solicitud, error } = await supabase
    .from("solicitudes_vacaciones")
    .insert({
      profesional_id: profesionalId,
      fecha_inicio: body.fechaInicio,
      fecha_fin: body.fechaFin,
      motivo: body.motivo || null,
      solicitado_por: admin.id,
      estado: aprobarDirectamente ? "aprobada" : "pendiente",
      resuelto_por: aprobarDirectamente ? admin.id : null,
      resuelto_en: aprobarDirectamente ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !solicitud) return NextResponse.json({ error: "No se pudo crear la solicitud." }, { status: 500 });
  return NextResponse.json({ solicitud });
}
