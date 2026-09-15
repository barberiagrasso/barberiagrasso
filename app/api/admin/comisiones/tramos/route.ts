import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarTramos, type TramoComision } from "@/lib/comisiones";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

interface FilaTramo {
  id: string;
  desde_centimos: number;
  hasta_centimos: number | null;
  porcentaje: string | number;
}

function aRespuesta(fila: FilaTramo) {
  return {
    id: fila.id,
    desdeCentimos: fila.desde_centimos,
    hastaCentimos: fila.hasta_centimos,
    porcentaje: Number(fila.porcentaje),
  };
}

/**
 * Lista los tramos de comisión actuales, ordenados de menor a mayor
 * facturación. Cualquier cuenta del panel puede leerlos (un barbero
 * necesita verlos para entender cómo se calcula su propia comisión),
 * pero solo el rol "admin" puede modificarlos (ver PUT más abajo).
 */
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data } = await supabase.from("comisiones_tramos").select("*").order("desde_centimos");
  return NextResponse.json({ tramos: (data ?? []).map(aRespuesta) });
}

/**
 * Sustituye la lista completa de tramos por la que mande el admin — se
 * valida primero (importes coherentes, sin solapes) y, si es válida, se
 * reemplaza de golpe en una sola transacción vía la función SQL
 * reemplazar_tramos_comision() (ver supabase/actualizar-comisiones.sql),
 * para que nunca haya una lectura a medias con la tabla vacía.
 */
export async function PUT(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const tramosBody = Array.isArray(body?.tramos) ? body.tramos : null;
  if (!tramosBody) {
    return NextResponse.json({ error: "Faltan los tramos." }, { status: 400 });
  }

  // Normaliza el body a números antes de validar — evita que un string
  // como "380000" (en vez del número 380000) se cuele como válido en las
  // comparaciones de validarTramos().
  const tramos: TramoComision[] = tramosBody.map((t: unknown) => {
    const fila = t as Record<string, unknown>;
    return {
      desdeCentimos: Number(fila?.desdeCentimos),
      hastaCentimos: fila?.hastaCentimos === null || fila?.hastaCentimos === undefined ? null : Number(fila.hastaCentimos),
      porcentaje: Number(fila?.porcentaje),
    };
  });

  const errorValidacion = validarTramos(tramos);
  if (errorValidacion) {
    return NextResponse.json({ error: errorValidacion }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("reemplazar_tramos_comision", { nuevos: tramos });

  if (error) {
    await registrarError({
      origen: "servidor",
      mensaje: "No se pudieron guardar los tramos de comisión.",
      detalle: error,
    });
    return NextResponse.json({ error: "No se pudieron guardar los tramos." }, { status: 500 });
  }

  return NextResponse.json({ tramos: ((data ?? []) as FilaTramo[]).map(aRespuesta) });
}
