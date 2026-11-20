import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDatosRecibo, type DatosRecibo } from "@/lib/recibo";
import { desgloseCaja, rangoDiaMadrid, type DesgloseCaja } from "@/lib/caja";

export interface SedeCaja {
  id: string;
  nombre: string;
  encargadoId: string | null;
  puedeCerrar: boolean;
}

/**
 * Sedes que ve esta cuenta en Caja. El dueño: todas (y puede cerrar
 * todas). Un barbero: las sedes donde trabaja (para ABRIR) y las que
 * tenga como encargado de caja (para CERRAR). `faltaSql` = aún no se ha
 * ejecutado supabase/anadir-cierre-caja.sql.
 */
export async function sedesDeCaja(admin: { id: string; rol: string; profesional_id?: string | null }): Promise<{ sedes: SedeCaja[]; faltaSql: boolean }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("sedes").select("id, nombre, encargado_caja_admin_id").order("nombre");
  if (error) return { sedes: [], faltaSql: true };
  const { error: errTabla } = await supabase.from("caja_dias").select("id", { head: true, count: "exact" }).limit(1);
  if (errTabla) return { sedes: [], faltaSql: true };
  const todas = (data ?? []) as { id: string; nombre: string; encargado_caja_admin_id: string | null }[];
  if (admin.rol === "admin") return { sedes: todas.map((s) => ({ id: s.id, nombre: s.nombre, encargadoId: s.encargado_caja_admin_id, puedeCerrar: true })), faltaSql: false };
  let deTrabajo = new Set<string>();
  if (admin.profesional_id) {
    const { data: ps } = await supabase.from("profesional_sedes").select("sede_id").eq("profesional_id", admin.profesional_id);
    deTrabajo = new Set((ps ?? []).map((p: { sede_id: string }) => p.sede_id));
  }
  return {
    sedes: todas
      .filter((s) => deTrabajo.has(s.id) || s.encargado_caja_admin_id === admin.id)
      .map((s) => ({ id: s.id, nombre: s.nombre, encargadoId: s.encargado_caja_admin_id, puedeCerrar: s.encargado_caja_admin_id === admin.id })),
    faltaSql: false,
  };
}

export interface FilaCaja {
  id: string;
  sede_id: string;
  fecha: string;
  abierta_at: string | null;
  abierta_por_nombre: string | null;
  fondo_inicial_centimos: number | null;
  cerrada_at: string | null;
  cerrada_por_nombre: string | null;
  efectivo_cobrado_centimos: number | null;
  tarjeta_centimos: number | null;
  bizum_centimos: number | null;
  otros_centimos: number | null;
  num_cobros: number | null;
  efectivo_esperado_centimos: number | null;
  efectivo_contado_centimos: number | null;
  diferencia_centimos: number | null;
  motivo_diferencia: string | null;
  fondo_siguiente_centimos: number | null;
  foto_ruta: string | null;
  notas: string | null;
}

export interface CitaPendiente {
  id: string;
  hora: string;
  cliente: string;
  barbero: string;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Citas del día aún "confirmadas": ni cobradas, ni canceladas, ni no presentadas. */
export async function citasSinResolver(sedeId: string, fecha: string): Promise<CitaPendiente[]> {
  const { desde, hasta } = rangoDiaMadrid(fecha);
  const { data } = await createAdminClient()
    .from("citas")
    .select("id, inicio, cliente:clientes(nombre), profesional:profesionales(nombre)")
    .eq("sede_id", sedeId)
    .eq("estado", "confirmada")
    .gte("inicio", desde)
    .lt("inicio", hasta)
    .order("inicio");
  return ((data ?? []) as unknown as { id: string; inicio: string; cliente: unknown; profesional: unknown }[]).map((c) => ({
    id: c.id,
    hora: new Date(c.inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }),
    cliente: (uno(c.cliente as { nombre: string } | null) as { nombre: string } | null)?.nombre ?? "Cliente",
    barbero: (uno(c.profesional as { nombre: string } | null) as { nombre: string } | null)?.nombre ?? "Sin asignar",
  }));
}

/** Lo cobrado ese día en esa sede (citas completadas, por día de la cita). */
export async function cobrosDelDia(sedeId: string, fecha: string): Promise<DesgloseCaja> {
  const supabase = createAdminClient();
  const { desde, hasta } = rangoDiaMadrid(fecha);
  const { data } = await supabase.from("citas").select("id").eq("sede_id", sedeId).eq("estado", "completada").gte("inicio", desde).lt("inicio", hasta);
  const recibos = await Promise.all((data ?? []).map((c: { id: string }) => obtenerDatosRecibo(supabase, c.id)));
  return desgloseCaja(recibos.filter((r): r is DatosRecibo => r !== null));
}

export async function filaCaja(sedeId: string, fecha: string): Promise<FilaCaja | null> {
  const { data } = await createAdminClient().from("caja_dias").select("*").eq("sede_id", sedeId).eq("fecha", fecha).maybeSingle();
  return (data as FilaCaja | null) ?? null;
}

/** Días anteriores a `fecha` que se abrieron y no se han cerrado. */
export async function diasSinCerrar(sedeId: string, fecha: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("caja_dias")
    .select("fecha")
    .eq("sede_id", sedeId)
    .lt("fecha", fecha)
    .is("cerrada_at", null)
    .order("fecha");
  return (data ?? []).map((d: { fecha: string }) => d.fecha);
}

/** Fondo que se dejó en el último cierre (para comprobar la apertura). */
export async function ultimoFondo(sedeId: string, fecha: string): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("caja_dias")
    .select("fondo_siguiente_centimos")
    .eq("sede_id", sedeId)
    .lt("fecha", fecha)
    .not("cerrada_at", "is", null)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { fondo_siguiente_centimos: number | null } | null)?.fondo_siguiente_centimos ?? null;
}
