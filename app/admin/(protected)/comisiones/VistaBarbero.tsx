"use client";

import { useState } from "react";
import { euros } from "@/lib/formato";
import { calcularComision, etiquetaMes, etiquetaTramo, type TramoComision } from "@/lib/comisiones";

interface FilaComision {
  profesionalId: string;
  nombre: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  tramo: TramoComision | null;
  siguienteTramo: TramoComision | null;
  posicion: number;
  totalBarberos: number;
  productosCentimos: number;
  comisionProductosCentimos: number;
}

// Color base de las zonas de la barra (el mismo amarillo de marca que el
// resto del panel) — se varía solo la opacidad, en rgba directo porque
// necesita interpolarse en JS según cuántos tramos haya, cosa que una
// clase de Tailwind fija no puede hacer.
const RGB_AMARILLO = "242, 211, 104";

/**
 * Franja horizontal con el recorrido de facturación del mes: una zona
 * gris para "todavía sin comisión" y una zona por tramo, cada vez más
 * saturada, con un marcador en la posición actual del barbero. Puramente
 * visual (los importes exactos van debajo, en las píldoras) — pensada
 * para verse de un vistazo, también en pantalla de móvil.
 */
function BarraProgreso({ facturacionCentimos, tramos }: { facturacionCentimos: number; tramos: TramoComision[] }) {
  if (tramos.length === 0) return null;

  const ultimoDesde = tramos[tramos.length - 1].desdeCentimos;
  // La escala visual llega un poco más allá del último tramo (o de la
  // propia facturación, si ya lo ha superado) para que el marcador nunca
  // se quede pegado al borde derecho.
  const escala = Math.max(ultimoDesde * 1.15, facturacionCentimos * 1.05, 100000);
  const pctDe = (valor: number) => Math.min(100, Math.max(0, (valor / escala) * 100));

  const zonas = [
    { desde: 0, hasta: tramos[0].desdeCentimos, color: "rgb(231, 229, 228)" }, // stone-200: sin comisión
    ...tramos.map((t, i) => ({
      desde: t.desdeCentimos,
      hasta: t.hastaCentimos ?? escala,
      color: `rgba(${RGB_AMARILLO}, ${(0.35 + 0.65 * (i / Math.max(1, tramos.length - 1))).toFixed(2)})`,
    })),
  ];

  const posicionMarcador = pctDe(facturacionCentimos);
  // El texto del marcador se recoloca un poco hacia dentro cerca de los
  // extremos para que nunca quede cortado por el borde de la tarjeta.
  const posicionEtiqueta = Math.min(88, Math.max(12, posicionMarcador));

  return (
    <div className="pt-7">
      <div className="relative">
        <div className="flex h-6 w-full overflow-hidden rounded-full border border-stone-200">
          {zonas.map((z, i) => (
            <div key={i} style={{ width: `${pctDe(z.hasta) - pctDe(z.desde)}%`, backgroundColor: z.color }} />
          ))}
        </div>
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-stone-900" style={{ left: `${posicionMarcador}%` }} />
        <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ left: `${posicionEtiqueta}%` }}>
          Tú: {euros(facturacionCentimos)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tramos.map((t, i) => {
          const activo = facturacionCentimos >= t.desdeCentimos && (t.hastaCentimos === null || facturacionCentimos < t.hastaCentimos);
          return (
            <span
              key={i}
              className={
                "rounded-full border px-2 py-0.5 text-[11px] " +
                (activo ? "border-brand-yellow bg-brand-yellow/20 font-semibold text-brand-yellow-dark" : "border-stone-200 text-stone-500")
              }
            >
              F{i + 1}: {euros(t.desdeCentimos)}
              {t.hastaCentimos === null ? "+" : ` – ${euros(t.hastaCentimos)}`} · {t.porcentaje}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Si facturo tanto, me llevo tanto": un slider libre (no atado a la
 * facturación real del mes) que recalcula la comisión al vuelo con la
 * misma función que usa el servidor — sin ninguna llamada de red, es
 * matemática pura en el navegador.
 */
function Simulador({ tramos, facturacionInicialCentimos }: { tramos: TramoComision[]; facturacionInicialCentimos: number }) {
  const ultimoDesde = tramos[tramos.length - 1]?.desdeCentimos ?? 500000;
  const escalaMaxima = Math.max(ultimoDesde * 1.5, facturacionInicialCentimos * 1.3, 500000);
  const [valorCentimos, setValorCentimos] = useState(Math.min(facturacionInicialCentimos, escalaMaxima));

  const { comisionCentimos, tramo } = calcularComision(valorCentimos, tramos);
  const etiqueta = tramo ? etiquetaTramo(tramo, tramos) : null;

  return (
    <div>
      <p className="text-sm text-stone-600">
        Si facturaras <span className="font-mono font-semibold text-stone-900">{euros(valorCentimos)}</span> en un mes, te
        llevarías <span className="font-mono font-semibold text-brand-yellow-dark">{euros(comisionCentimos)}</span> de
        comisión{tramo ? ` (${etiqueta}, ${tramo.porcentaje}%)` : " (por debajo del primer tramo, 0%)"}.
      </p>
      <input
        type="range"
        min={0}
        max={escalaMaxima}
        step={1000}
        value={valorCentimos}
        onChange={(e) => setValorCentimos(Number(e.target.value))}
        className="mt-3 w-full accent-brand-yellow"
        aria-label="Facturación simulada"
      />
      <div className="flex justify-between text-[11px] text-stone-400">
        <span>0€</span>
        <span>{euros(escalaMaxima)}</span>
      </div>
    </div>
  );
}

export default function VistaBarbero({
  fila,
  tramos,
  mes,
  esMesActual,
  porcentajeProductos,
}: {
  fila: FilaComision | undefined;
  tramos: TramoComision[];
  mes: string;
  esMesActual: boolean;
  porcentajeProductos: number;
}) {
  if (!fila) {
    return <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">No se ha encontrado tu ficha de profesional.</p>;
  }

  const etiquetaTramoActual = fila.tramo ? etiquetaTramo(fila.tramo, tramos) : null;
  const etiquetaSiguiente = fila.siguienteTramo ? etiquetaTramo(fila.siguienteTramo, tramos) : null;

  return (
    <div className="space-y-5">
      {/* --- Meta: cuánto falta para el siguiente tramo --- */}
      {esMesActual && (
        <div className="rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 p-4">
          <div className="font-mono text-xs uppercase tracking-wider text-brand-yellow-dark">Tu meta</div>
          {fila.siguienteTramo && etiquetaSiguiente ? (
            <p className="mt-1 text-sm text-stone-800">
              Te faltan <span className="font-semibold">{euros(fila.siguienteTramo.desdeCentimos - fila.facturacionCentimos)}</span> para
              pasar a <span className="font-semibold">{etiquetaSiguiente}</span> y pasar del{" "}
              <span className="font-semibold">{fila.tramo?.porcentaje ?? 0}%</span> al{" "}
              <span className="font-semibold">{fila.siguienteTramo.porcentaje}%</span>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-800">
              ¡Ya estás en el tramo más alto{etiquetaTramoActual ? ` (${etiquetaTramoActual}, ${fila.tramo?.porcentaje}%)` : ""}!
            </p>
          )}
        </div>
      )}

      {/* --- Facturación, comisión, tramo y ranking del mes --- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Facturación de {etiquetaMes(mes)}</div>
          <div className="mt-1 text-2xl font-bold text-stone-900">{euros(fila.facturacionCentimos)}</div>
          <div className="mt-0.5 text-xs text-stone-400">{fila.citasCompletadas} citas completadas</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisión de {etiquetaMes(mes)}</div>
          <div className="mt-1 text-2xl font-bold text-brand-yellow-dark">{euros(fila.comisionCentimos)}</div>
          <div className="mt-0.5 text-xs text-stone-400">{fila.tramo ? `${etiquetaTramoActual} · ${fila.tramo.porcentaje}%` : "Sin tramo"}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-stone-200 bg-white p-4 lg:col-span-2">
          <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Tu ranking</div>
          <div className="mt-1 text-2xl font-bold text-stone-900">
            {fila.posicion}º <span className="text-base font-normal text-stone-400">de {fila.totalBarberos}</span>
          </div>
          <div className="mt-0.5 text-xs text-stone-400">por facturación este mes</div>
        </div>
      </div>

      {/* --- Productos: aparte de servicios, comisión plana sin tramos --- */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Productos de {etiquetaMes(mes)}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-stone-500">Vendido</div>
            <div className="mt-0.5 text-xl font-bold text-stone-900">{euros(fila.productosCentimos)}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Tu comisión ({porcentajeProductos}%)</div>
            <div className="mt-0.5 text-xl font-bold text-brand-yellow-dark">{euros(fila.comisionProductosCentimos)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Un porcentaje fijo sobre lo vendido, sin tramos ni mínimo — no cuenta para el ranking de arriba, que es solo por
          servicios.
        </p>
      </div>

      {/* --- Progreso visual hacia el siguiente tramo --- */}
      <div className="rounded-lg border border-stone-200 bg-white p-4 pt-2">
        <h3 className="mb-1 font-mono text-xs uppercase tracking-wider text-stone-500">Tu recorrido</h3>
        <BarraProgreso facturacionCentimos={fila.facturacionCentimos} tramos={tramos} />
      </div>

      {/* --- Simulador --- */}
      {tramos.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-stone-500">Simulador de comisión</h3>
          <Simulador tramos={tramos} facturacionInicialCentimos={fila.facturacionCentimos} />
        </div>
      )}
    </div>
  );
}
