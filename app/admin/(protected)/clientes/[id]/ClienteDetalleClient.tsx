"use client";

import { useState } from "react";
import Link from "next/link";
import { formatearGrassoCoins } from "@/lib/grassocoins";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  grassocoins: number;
  grassocoins_resto_centimos: number;
  created_at: string;
}

interface Movimiento {
  id: string;
  tipo: "acumulacion" | "canje" | "canje_producto" | "reembolso" | "ajuste_manual" | "caducidad";
  coins: number;
  gasto_centimos: number | null;
  coins_resultantes: number;
  nota: string | null;
  creado_por: string;
  created_at: string;
}

interface CitaResumen {
  id: string;
  inicio: string;
  estado: string;
  saldoCanjeadoCentimos: number;
  grassocoinsCanjeados: number;
  servicioNombre: string;
  sedeNombre: string;
}

const ETIQUETA_TIPO: Record<Movimiento["tipo"], string> = {
  acumulacion: "Ganadas al cobrar",
  canje: "Canje de cita",
  canje_producto: "Canje de productos",
  reembolso: "Devueltas (cancelación)",
  caducidad: "Caducadas (6 meses sin venir)",
  ajuste_manual: "Ajuste manual",
};

const ETIQUETA_ESTADO_CITA: Record<string, string> = {
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  no_presentada: "No presentada",
};

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default function ClienteDetalleClient({
  cliente,
  movimientosIniciales,
  citas,
}: {
  cliente: Cliente;
  movimientosIniciales: Movimiento[];
  citas: CitaResumen[];
}) {
  const [coins, setCoins] = useState(cliente.grassocoins);
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [importe, setImporte] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function aplicarAjuste() {
    const coinsAjuste = Number(importe.trim());
    if (!Number.isInteger(coinsAjuste) || coinsAjuste === 0) {
      setError("Escribe un número entero de GrassoCoins (positivo para sumar, negativo para restar).");
      return;
    }
    if (!nota.trim()) {
      setError("Explica brevemente el motivo del ajuste.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/admin/clientes/${cliente.id}/saldo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coins: coinsAjuste, nota: nota.trim() }),
    });
    const json = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(json.error || "No se pudo aplicar el ajuste.");
      return;
    }
    setCoins(json.grassocoins);
    setMovimientos((prev) => [
      {
        id: `temporal-${Date.now()}`,
        tipo: "ajuste_manual",
        coins: coinsAjuste,
        gasto_centimos: null,
        coins_resultantes: json.grassocoins,
        nota: nota.trim(),
        creado_por: "Tú",
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setImporte("");
    setNota("");
    setMostrarForm(false);
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/clientes" className="text-sm text-stone-500 hover:text-stone-700">
        ← Todos los clientes
      </Link>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-stone-900">{cliente.nombre}</h1>
            {cliente.telefono && <p className="text-sm text-stone-500">{cliente.telefono}</p>}
            {cliente.email && <p className="text-sm text-stone-500">{cliente.email}</p>}
            <p className="mt-1 text-xs text-stone-400">Cliente desde {formatoFecha(cliente.created_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-stone-500">GrassoCoins</p>
            <p className="font-mono text-2xl font-bold text-brand-yellow-dark">{coins}</p>
            {cliente.grassocoins_resto_centimos > 0 && (
              <p className="text-xs text-stone-400">
                + {formatearPrecio(cliente.grassocoins_resto_centimos)} guardados para la siguiente
              </p>
            )}
            <button
              onClick={() => setMostrarForm((v) => !v)}
              className="mt-1 text-xs font-medium text-stone-500 underline hover:text-stone-700"
            >
              {mostrarForm ? "Cancelar" : "Ajustar a mano"}
            </button>
          </div>
        </div>

        {mostrarForm && (
          <div className="mt-4 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="Coins (p. ej. 2 o -1)"
                inputMode="numeric"
                className="w-48 rounded-lg border border-stone-300 p-2 text-sm"
              />
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Motivo (obligatorio)"
                className="flex-1 min-w-[12rem] rounded-lg border border-stone-300 p-2 text-sm"
              />
              <button
                onClick={aplicarAjuste}
                disabled={enviando}
                className="rounded-none bg-brand-black px-4 py-2 text-sm font-medium text-brand-white hover:opacity-85 disabled:opacity-50 transition-opacity"
              >
                {enviando ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Movimientos de GrassoCoins ({movimientos.length})
        </h2>
        {movimientos.length === 0 ? (
          <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Todavía no tiene ningún movimiento de GrassoCoins.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Coins</th>
                  <th className="p-3">Total tras el movimiento</th>
                  <th className="p-3">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="p-3 text-stone-500">{formatoFecha(m.created_at)}</td>
                    <td className="p-3 text-stone-700">{ETIQUETA_TIPO[m.tipo]}</td>
                    <td className={"p-3 font-mono " + (m.coins >= 0 ? "text-emerald-700" : "text-red-700")}>
                      {m.coins >= 0 ? "+" : ""}
                      {m.coins}
                    </td>
                    <td className="p-3 font-mono text-stone-600">{m.coins_resultantes}</td>
                    <td className="p-3 text-stone-500">
                      {m.nota ??
                        (m.tipo === "acumulacion" && m.gasto_centimos
                          ? `Por ${formatearPrecio(m.gasto_centimos)} gastados`
                          : m.creado_por !== "sistema"
                            ? `Por ${m.creado_por}`
                            : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Últimas citas ({citas.length})
        </h2>
        {citas.length === 0 ? (
          <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Todavía no tiene ninguna cita.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Servicio</th>
                  <th className="p-3">Sede</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {citas.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 text-stone-500">{formatoFecha(c.inicio)}</td>
                    <td className="p-3 text-stone-700">{c.servicioNombre}</td>
                    <td className="p-3 text-stone-500">{c.sedeNombre}</td>
                    <td className="p-3 text-stone-500">{ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado}</td>
                    <td className="p-3 text-stone-500">
                      {c.grassocoinsCanjeados > 0
                        ? `Canjeada (${formatearGrassoCoins(c.grassocoinsCanjeados)})`
                        : c.saldoCanjeadoCentimos > 0
                          ? `Con saldo antiguo (${formatearPrecio(c.saldoCanjeadoCentimos)})`
                          : "Efectivo/tarjeta"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
