import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Todos los cierres de caja en un archivo que abre Excel (CSV con ";"),
// para sustituir al Excel que se rellenaba a mano.
export async function GET(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const sp = request.nextUrl.searchParams;
  let q = createAdminClient().from("caja_dias").select("*, sede:sedes(nombre)").order("fecha", { ascending: false });
  if (sp.get("desde")) q = q.gte("fecha", sp.get("desde")!);
  if (sp.get("hasta")) q = q.lte("fecha", sp.get("hasta")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "No se pudieron leer los cierres." }, { status: 500 });
  const e = (n: number | null) => (n == null ? "" : (n / 100).toFixed(2).replace(".", ","));
  const t = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const h = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "");
  const filas = [
    ["Fecha", "Sede", "Abierta por", "Fondo inicial", "Efectivo", "Tarjeta", "Bizum", "Otros", "Total cobrado", "Nº cobros", "Efectivo esperado", "Efectivo contado", "Diferencia", "Motivo", "Fondo para mañana", "Sobre", "Cerrada por", "Hora cierre"].join(";"),
    ...(data ?? []).map((r: Record<string, unknown>) => {
      const n = (k: string) => (r[k] as number | null) ?? null;
      const total = (n("efectivo_cobrado_centimos") ?? 0) + (n("tarjeta_centimos") ?? 0) + (n("bizum_centimos") ?? 0) + (n("otros_centimos") ?? 0);
      const sede = (Array.isArray(r.sede) ? r.sede[0] : r.sede) as { nombre: string } | null;
      return [
        String(r.fecha).split("-").reverse().join("/"),
        t(sede?.nombre ?? ""),
        t(r.abierta_por_nombre as string | null),
        e(n("fondo_inicial_centimos")),
        e(n("efectivo_cobrado_centimos")),
        e(n("tarjeta_centimos")),
        e(n("bizum_centimos")),
        e(n("otros_centimos")),
        r.cerrada_at ? e(total) : "",
        n("num_cobros") ?? "",
        e(n("efectivo_esperado_centimos")),
        e(n("efectivo_contado_centimos")),
        e(n("diferencia_centimos")),
        t(r.motivo_diferencia as string | null),
        e(n("fondo_siguiente_centimos")),
        r.cerrada_at ? e((n("efectivo_contado_centimos") ?? 0) - (n("fondo_siguiente_centimos") ?? 0)) : "",
        t(r.cerrada_por_nombre as string | null),
        h(r.cerrada_at as string | null),
      ].join(";");
    }),
  ];
  return new NextResponse("﻿" + filas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cierres-de-caja.csv"` },
  });
}
