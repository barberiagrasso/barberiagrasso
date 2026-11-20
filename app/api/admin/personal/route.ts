import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rangoDiaMadrid } from "@/lib/caja";

export const dynamic = "force-dynamic";

const MES = /^\d{4}-\d{2}$/;

// Lo que ve cada barbero de sí mismo y lo que ve el dueño de todo el
// equipo: sueldo base, meta, valoraciones del mes y sus comentarios.
export async function GET(request: NextRequest) {
  let admin: { rol: string; profesional_id: string | null };
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const mes = request.nextUrl.searchParams.get("mes") ?? "";
  if (!MES.test(mes)) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });

  const supabase = createAdminClient();
  let profQ = supabase.from("profesionales").select("id, nombre, foto_url").eq("activo", true).order("nombre");
  if (admin.rol !== "admin") profQ = profQ.eq("id", admin.profesional_id ?? "00000000-0000-0000-0000-000000000000");
  const { data: profesionales } = await profQ;
  const ids = (profesionales ?? []).map((p) => p.id);

  const [{ data: cfg, error: errCfg }, { data: resenas }] = await Promise.all([
    supabase.from("personal_config").select("profesional_id, sueldo_base_centimos, meta_mensual_centimos, notas").in("profesional_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    (async () => {
      const [y, m] = mes.split("-").map(Number);
      const desde = rangoDiaMadrid(`${y}-${String(m).padStart(2, "0")}-01`).desde;
      const sig = new Date(Date.UTC(y, m, 1));
      const hasta = rangoDiaMadrid(`${sig.getUTCFullYear()}-${String(sig.getUTCMonth() + 1).padStart(2, "0")}-01`).desde;
      return supabase
        .from("resenas")
        .select("profesional_id, estrellas, comentario, created_at")
        .in("profesional_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .gte("created_at", desde)
        .lt("created_at", hasta)
        .order("created_at", { ascending: false });
    })(),
  ]);

  const faltaSql = Boolean(errCfg);
  const porPro = (id: string) => {
    const r = (resenas ?? []).filter((x) => x.profesional_id === id);
    const media = r.length ? r.reduce((a, x) => a + x.estrellas, 0) / r.length : null;
    return { valoraciones: r.length, media: media === null ? null : Math.round(media * 10) / 10, comentarios: r.filter((x) => x.comentario).slice(0, 5).map((x) => ({ estrellas: x.estrellas, texto: x.comentario })) };
  };
  type Cfg = { profesional_id: string; sueldo_base_centimos: number; meta_mensual_centimos: number; notas: string | null };
  const cfgPor = new Map(((cfg ?? []) as Cfg[]).map((c) => [c.profesional_id, c]));

  return NextResponse.json({
    mes,
    esAdmin: admin.rol === "admin",
    faltaSql,
    personal: (profesionales ?? []).map((p) => {
      const c = cfgPor.get(p.id);
      return {
        profesionalId: p.id,
        nombre: p.nombre,
        fotoUrl: p.foto_url,
        sueldoBaseCentimos: c?.sueldo_base_centimos ?? 0,
        metaMensualCentimos: c?.meta_mensual_centimos ?? 400000,
        notas: admin.rol === "admin" ? (c?.notas ?? "") : undefined,
        opiniones: porPro(p.id),
      };
    }),
  });
}

// Solo el dueño cambia sueldos, metas y notas.
export async function PUT(request: NextRequest) {
  let admin: { rol: string };
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  if (admin.rol !== "admin") return NextResponse.json({ error: "Solo el dueño puede cambiar los datos de personal." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.profesionalId === "string" ? body.profesionalId : "";
  const sueldo = Number(body?.sueldoBaseCentimos);
  const meta = Number(body?.metaMensualCentimos);
  if (!id || !Number.isInteger(sueldo) || sueldo < 0 || !Number.isInteger(meta) || meta < 0) {
    return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("personal_config")
    .upsert(
      { profesional_id: id, sueldo_base_centimos: sueldo, meta_mensual_centimos: meta, notas: String(body?.notas ?? "").slice(0, 1000) || null, updated_at: new Date().toISOString() },
      { onConflict: "profesional_id" },
    );
  if (error) return NextResponse.json({ error: "No se pudo guardar. ¿Se ha ejecutado supabase/anadir-personal.sql?" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
