import { euros } from "@/lib/formato";
import type { DatosRecibo } from "@/lib/recibo";

// Vista puramente de presentación del recibo de una cita (ver
// lib/recibo.ts): la usan tanto el panel de admin (con botones de anular
// y enviar por WhatsApp, ver CalendarioDia.tsx) como el propio cliente en
// "Mi perfil" → Historial de citas (solo lectura) — de ahí que no traiga
// ninguna lógica de negocio ni llamada a la API, solo recibe los datos ya
// calculados y un hueco opcional para las acciones de quien la use.

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Terminal de tarjeta física",
  bizum: "Bizum",
  bono: "Bono",
  otro: "Otro método",
  mixto: "Varios métodos",
};

function etiquetaMetodo(metodo: string | null) {
  if (!metodo) return "Sin especificar";
  return ETIQUETA_METODO[metodo] ?? metodo;
}

function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

export function ReciboView({ recibo, acciones }: { recibo: DatosRecibo; acciones?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className={
              "inline-block rounded-full px-2.5 py-1 text-xs font-semibold " +
              (recibo.anulado ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")
            }
          >
            {recibo.anulado ? "Anulado" : "Pagado"}
          </span>
          <div className="mt-1.5 text-sm text-stone-500">
            Recibo #{recibo.codigo}
            {recibo.pagadoAtISO && <> · {formatoFechaHora(recibo.pagadoAtISO)}</>}
          </div>
        </div>
      </div>

      {recibo.anulado && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Este recibo fue anulado y archivado.</p>
          <p className="mt-0.5 text-red-600">
            {formatoFechaHora(recibo.anulado.atISO)}
            {recibo.anulado.por && <> · por {recibo.anulado.por}</>}
          </p>
          {recibo.anulado.motivo && <p className="mt-1 italic text-red-600">“{recibo.anulado.motivo}”</p>}
          <p className="mt-1 text-red-600">No cuenta en la facturación ni en las comisiones.</p>
        </div>
      )}

      <div>
        <p className="font-semibold text-stone-900">Barbería Grasso · {recibo.sedeNombre}</p>
        {recibo.sedeDireccion && <p className="text-sm text-stone-500">{recibo.sedeDireccion}</p>}
        <p className="mt-1 text-sm text-stone-500">
          {formatoFechaHora(recibo.fechaCitaISO)} · {recibo.profesionalNombre}
        </p>
      </div>

      <div className="rounded-lg border border-stone-200">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 p-3 text-sm">
          {recibo.lineas.map((l, i) => (
            <div key={i} className="contents">
              <span className="text-stone-700">
                {l.nombre}
                {l.cantidad > 1 && <span className="text-stone-400"> ×{l.cantidad}</span>}
              </span>
              <span className="text-right tabular-nums text-stone-700">{euros(l.precioUnitarioCentimos * l.cantidad)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-stone-200 p-3 text-sm">
          <div className="flex justify-between text-stone-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{euros(recibo.subtotalCentimos)}</span>
          </div>
          {recibo.descuentoCentimos > 0 && (
            <div className="flex justify-between text-stone-500">
              <span>Descuento{recibo.descuentoMotivo ? ` (${recibo.descuentoMotivo})` : ""}</span>
              <span className="tabular-nums">−{euros(recibo.descuentoCentimos)}</span>
            </div>
          )}
          {recibo.pagadoConSaldoCentimos > 0 && (
            <div className="flex justify-between text-stone-500">
              <span>Pagado con saldo de fidelización</span>
              <span className="tabular-nums">−{euros(recibo.pagadoConSaldoCentimos)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-semibold text-stone-900">
            <span>Total</span>
            <span className="tabular-nums">{euros(recibo.totalCentimos)}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">Pagos</p>
        {recibo.pagosMixtos.length > 0 ? (
          <div className="space-y-1 text-sm">
            {recibo.pagosMixtos.map((p, i) => (
              <div key={i} className="flex justify-between text-stone-700">
                <span>{etiquetaMetodo(p.metodo)}</span>
                <span className="tabular-nums">{euros(p.importeCentimos)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-between text-sm text-stone-700">
            <span>{etiquetaMetodo(recibo.metodoPago)}</span>
            <span className="tabular-nums">{euros(recibo.totalCentimos)}</span>
          </div>
        )}
      </div>

      {acciones}
    </div>
  );
}
