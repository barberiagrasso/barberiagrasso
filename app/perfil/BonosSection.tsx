import { GrassoMark } from "@/components/brand/GrassoMark";
import { bonoEsUtilizable, bonoEstaVigente, type BonoConTipo } from "@/lib/bonos";

function euros(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function formatoFechaCorta(fechaISO: string) {
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Bonos del cliente, como tarjetas de sello (pedido explícito de Diego):
 * cuatro casillas, las ya usadas selladas con el logo de la barbería. Un
 * bono agotado o caducado NUNCA desaparece de aquí — se queda tal cual,
 * solo cambia su estado visual — porque sigue siendo parte del
 * historial de compras del cliente.
 */
export function BonosSection({ bonos }: { bonos: BonoConTipo[] }) {
  if (bonos.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 font-heading text-lg text-brand-white">Tus bonos</h2>
      <div className="space-y-3">
        {bonos.map((bono) => (
          <TarjetaBono key={bono.id} bono={bono} />
        ))}
      </div>
    </div>
  );
}

function TarjetaBono({ bono }: { bono: BonoConTipo }) {
  const vigente = bonoEstaVigente(bono);
  const utilizable = bonoEsUtilizable(bono);
  const usosHechos = bono.usos_totales - bono.usos_restantes;

  let estadoTexto: string;
  let estadoColor: string;
  if (utilizable) {
    estadoTexto = `Válido hasta el ${formatoFechaCorta(bono.fecha_caducidad)}`;
    estadoColor = "text-brand-yellow";
  } else if (!vigente) {
    estadoTexto = `Caducó el ${formatoFechaCorta(bono.fecha_caducidad)}`;
    estadoColor = "text-brand-white-dim";
  } else {
    estadoTexto = "Usado por completo";
    estadoColor = "text-brand-white-dim";
  }

  return (
    <div className={"rounded-xl border border-brand-line bg-brand-black-soft/60 p-4" + (utilizable ? "" : " opacity-70")}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-heading text-base text-brand-white">{bono.tipo.nombre}</p>
          <p className={"font-body text-xs " + estadoColor}>{estadoTexto}</p>
        </div>
        <p className="font-mono text-xs text-brand-white-dim">{euros(bono.precio_pagado_centimos)}</p>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: bono.usos_totales }).map((_, i) => {
          const sellado = i < usosHechos;
          return (
            <div
              key={i}
              className={
                "flex h-11 w-11 items-center justify-center rounded-full border " +
                (sellado ? "border-brand-yellow/40 bg-brand-yellow/10" : "border-brand-line bg-transparent")
              }
            >
              {sellado && <GrassoMark className="h-6 w-6" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
