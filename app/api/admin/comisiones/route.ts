import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango } from "@/lib/informes";
import { calcularComision, rangoDelMes, siguienteTramo, mesActualStr, type TramoComision } from "@/lib/comisiones";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  profesional_id: string | null;
  saldo_canjeado_centimos: number;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio: { precio_centimos: number } | { precio_centimos: number }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Mismo criterio que /api/admin/informes/resumen: el precio del servicio
// más sus complementos, salvo que se haya pagado con saldo de
// fidelización (ahí no entró dinero real, así que tampoco debe generar
// comisión — ya se contó como gasto real cuando se generó ese saldo).
function ingresoCitaCentimos(c: CitaFila, extrasPorCita: Map<string, number>): number {
  if (c.saldo_canjeado_centimos > 0) return 0;
  const servicio = uno(c.servicio);
  return (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
}

interface FilaComision {
  profesionalId: string;
  nombre: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  tramo: TramoComision | null;
  siguienteTramo: TramoComision | null;
}

/**
 * Facturación, tramo y comisión de cada barbero para un mes dado. Un
 * barbero (rol "barbero") solo recibe SU PROPIA fila — el filtrado es en
 * el servidor, no en el cliente, para que nunca viaje por la red la
 * comisión de un compañero. El rol "admin" recibe a todo el equipo
 * activo (con 0€ los que no hayan facturado nada ese mes) más a
 * cualquier barbero ya dado de baja que sí facturara ese mes.
 */
export async function GET(request: NextRequest) {
  let admin: { rol: string; profesional_id: string | null };
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const mes = request.nextUrl.searchParams.get("mes") || mesActualStr();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  if (admin.rol === "barbero" && !admin.profesional_id) {
    return NextResponse.json({ error: "Tu cuenta no está enlazada a ningún profesional." }, { status: 400 });
  }

  const { desdeStr, hastaStr } = rangoDelMes(mes);
  const rango = parseRango(desdeStr, hastaStr);
  const supabase = createAdminClient();

  const { data: tramosCrudos } = await supabase.from("comisiones_tramos").select("desde_centimos, hasta_centimos, porcentaje").order("desde_centimos");
  const tramos: TramoComision[] = (tramosCrudos ?? []).map((t) => ({
    desdeCentimos: t.desde_centimos,
    hastaCentimos: t.hasta_centimos,
    porcentaje: Number(t.porcentaje),
  }));

  let citasQuery = supabase
    .from("citas")
    .select("id, profesional_id, saldo_canjeado_centimos, profesional:profesionales(nombre), servicio:servicios(precio_centimos)")
    .eq("estado", "completada")
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString())
    .not("profesional_id", "is", null); // sin barbero asignado no hay a quién pagarle comisión

  if (admin.rol === "barbero") {
    citasQuery = citasQuery.eq("profesional_id", admin.profesional_id!);
  }

  const { data: citasCrudas } = await citasQuery;
  const citas = (citasCrudas ?? []) as unknown as CitaFila[];

  const idsCitas = citas.map((c) => c.id);
  const { data: extras } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos")
    .in("cita_id", idsCitas.length ? idsCitas : ["00000000-0000-0000-0000-000000000000"]);
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);
  }

  // Agrega facturación y nº de citas por profesional a partir de las
  // citas reales del mes — cubre también a un barbero ya dado de baja
  // que facturara ese mes (no apareceria en el roster de activos de
  // abajo, pero su comisión de ese mes sigue siendo un dato real).
  const porProfesional = new Map<string, { nombre: string; facturacionCentimos: number; citasCompletadas: number }>();
  for (const c of citas) {
    if (!c.profesional_id) continue;
    const nombre = uno(c.profesional)?.nombre ?? "Sin nombre";
    const actual = porProfesional.get(c.profesional_id) ?? { nombre, facturacionCentimos: 0, citasCompletadas: 0 };
    actual.facturacionCentimos += ingresoCitaCentimos(c, extrasPorCita);
    actual.citasCompletadas += 1;
    porProfesional.set(c.profesional_id, actual);
  }

  // Para el rol "admin": añade con 0€ a cualquier profesional activo que
  // no haya facturado nada este mes, para que el roster completo del
  // equipo se vea de un vistazo (incluidos los que están a 0).
  if (admin.rol === "admin") {
    const { data: activos } = await supabase.from("profesionales").select("id, nombre").eq("activo", true);
    for (const p of activos ?? []) {
      if (!porProfesional.has(p.id)) {
        porProfesional.set(p.id, { nombre: p.nombre, facturacionCentimos: 0, citasCompletadas: 0 });
      }
    }
  }

  const filas: FilaComision[] = Array.from(porProfesional.entries())
    .map(([profesionalId, datos]) => {
      const { comisionCentimos, tramo } = calcularComision(datos.facturacionCentimos, tramos);
      return {
        profesionalId,
        nombre: datos.nombre,
        facturacionCentimos: datos.facturacionCentimos,
        citasCompletadas: datos.citasCompletadas,
        comisionCentimos,
        tramo,
        siguienteTramo: siguienteTramo(datos.facturacionCentimos, tramos),
      };
    })
    .sort((a, b) => b.facturacionCentimos - a.facturacionCentimos);

  const totalComisionCentimos = filas.reduce((acc, f) => acc + f.comisionCentimos, 0);
  const totalFacturacionCentimos = filas.reduce((acc, f) => acc + f.facturacionCentimos, 0);

  return NextResponse.json({ mes, filas, totalComisionCentimos, totalFacturacionCentimos });
}
