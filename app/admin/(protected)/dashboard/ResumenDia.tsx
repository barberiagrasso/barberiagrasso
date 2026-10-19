interface CitaResumen {
  estado: string;
  precio_final_centimos?: number | null;
  servicio: { precio_centimos?: number } | { precio_centimos?: number }[] | null;
  extras?: { precio_centimos?: number }[];
}

function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

function euros(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Tira de resumen del día, arriba de la Agenda — pedido de Diego
// (19/10/2026, revisión de paneles): antes se entraba directo al
// calendario sin ningún vistazo rápido. Se calcula a partir de las
// mismas citas que ya trae cargadas la propia Agenda (datosIniciales,
// ver dashboard/page.tsx) — cero consultas nuevas a la base de datos.
export function ResumenDia({ citas }: { citas: CitaResumen[] }) {
  const activas = citas.filter((c) => c.estado !== "cancelada");
  const completadas = citas.filter((c) => c.estado === "completada");
  const cobradoCentimos = completadas.reduce((acc, c) => {
    const servicio = uno(c.servicio);
    const automatico = (servicio?.precio_centimos ?? 0) + (c.extras ?? []).reduce((a, e) => a + (e.precio_centimos ?? 0), 0);
    return acc + (typeof c.precio_final_centimos === "number" ? c.precio_final_centimos : automatico);
  }, 0);

  // Tratamiento "destacado" (esquina superior izquierda cortada, resto recta,
  // sin borde — el color de fondo hace el trabajo): es la firma visual que
  // reservamos para paneles de "vistazo rápido" como este, no para tarjetas
  // normales de listado (esas siguen con su rounded-lg de siempre).
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="rounded-tl-md bg-stone-100 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Citas hoy</div>
        <div className="text-lg font-bold text-stone-900">{activas.length}</div>
      </div>
      <div className="rounded-tl-md bg-stone-100 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Completadas</div>
        <div className="text-lg font-bold text-stone-900">{completadas.length}</div>
      </div>
      <div className="col-span-2 rounded-tl-md bg-stone-100 p-4 sm:col-span-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Cobrado hoy</div>
        <div className="text-lg font-bold text-emerald-700">{euros(cobradoCentimos)}</div>
      </div>
    </div>
  );
}
