import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverCandidatosConDestinosPuntuales } from "@/lib/availability";

export const dynamic = "force-dynamic";

// Lista de profesionales que trabajan en una sede y realizan un servicio
// concreto. Se usa en el paso "elige profesional (opcional)" del flujo
// de reserva pública (sin fecha: ese paso va ANTES de elegir día, así
// que nunca puede reflejar un destino puntual) y en los desplegables del
// panel de admin que sí conocen la fecha (formulario de "+ Nueva cita" y
// el "quién la hizo" de Finalizar cita) — a esos, pasarles fecha permite
// que aparezca un profesional puntualmente destinado a esta sede ese día
// concreto (p.ej. Juan en Los Molinos), aunque no sea de aquí de forma
// habitual.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId"); // opcional: si no se pasa, no filtra por servicio
  const fecha = params.get("fecha"); // opcional: "YYYY-MM-DD"

  if (!sedeId) {
    return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: sedeProfesionales } = await supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);

  const candidatosPermanentes = (sedeProfesionales ?? []).map((sp) => {
    const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
    return { id: sp.profesional_id as string, nombre: (prof as { nombre: string })?.nombre ?? "" };
  });

  let idsConServicio: Set<string> | null = null;
  if (servicioId) {
    const { data: profesionalServicios } = await supabase
      .from("profesional_servicios")
      .select("profesional_id")
      .eq("servicio_id", servicioId);
    idsConServicio = new Set((profesionalServicios ?? []).map((p) => p.profesional_id));
  }

  let candidatos = candidatosPermanentes;
  if (fecha) {
    const idsPermanentes = candidatosPermanentes.map((c) => c.id);
    const consultasDestinos = [
      supabase
        .from("destinos_puntuales")
        .select("profesional_id, sede_id, fecha, hora_inicio, hora_fin, profesionales!inner(nombre)")
        .eq("sede_id", sedeId)
        .eq("fecha", fecha),
    ];
    if (idsPermanentes.length > 0) {
      consultasDestinos.push(
        supabase
          .from("destinos_puntuales")
          .select("profesional_id, sede_id, fecha, hora_inicio, hora_fin, profesionales!inner(nombre)")
          .eq("fecha", fecha)
          .in("profesional_id", idsPermanentes)
      );
    }
    const resultadosDestinos = await Promise.all(consultasDestinos);
    const destinosPorProfesional = new Map<
      string,
      { profesional_id: string; nombre: string; sede_id: string; fecha: string; hora_inicio: string; hora_fin: string }
    >();
    for (const { data } of resultadosDestinos) {
      for (const fila of data ?? []) {
        const prof = Array.isArray(fila.profesionales) ? fila.profesionales[0] : fila.profesionales;
        destinosPorProfesional.set(fila.profesional_id, {
          profesional_id: fila.profesional_id,
          nombre: (prof as { nombre: string } | null)?.nombre ?? "",
          sede_id: fila.sede_id,
          fecha: fila.fecha,
          hora_inicio: fila.hora_inicio,
          hora_fin: fila.hora_fin,
        });
      }
    }
    const destinosDelDia = [...destinosPorProfesional.values()];

    ({ candidatos } = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes,
      destinosDelDia,
      sedeId,
      // Si no se pidió filtrar por servicio, que un destino puntual no
      // quede fuera solo por no saber si lo hace o no: se le deja pasar
      // igual, y el filtro de servicio de más abajo (si lo hay) se le
      // aplica exactamente igual que a un profesional permanente.
      idsQueHacenServicio: idsConServicio ?? new Set(destinosDelDia.map((d) => d.profesional_id)),
    }));
  }

  const profesionalesSinFoto = candidatos.filter((c) => !idsConServicio || idsConServicio.has(c.id));

  // Foto de perfil (pedido de Diego, 19/09/2026): se añade aparte, en vez
  // de meterla en los selects de arriba, para no tener que tocar el
  // tipado de resolverCandidatosConDestinosPuntuales (compartido con el
  // cálculo real de disponibilidad en lib/availability.ts).
  const ids = profesionalesSinFoto.map((p) => p.id);
  const { data: fotos } =
    ids.length > 0
      ? await supabase.from("profesionales").select("id, foto_url").in("id", ids)
      : { data: [] as { id: string; foto_url: string | null }[] };
  const fotoPorId = new Map((fotos ?? []).map((f) => [f.id, f.foto_url]));
  const profesionales = profesionalesSinFoto.map((p) => ({ ...p, foto_url: fotoPorId.get(p.id) ?? null }));

  return NextResponse.json({ profesionales });
}
