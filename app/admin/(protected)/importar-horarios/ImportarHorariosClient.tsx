"use client";

import { useState } from "react";
import type { HorarioBooksy } from "@/lib/horariosBooksy";

interface Fila extends HorarioBooksy {
  sedeNombre: string | null;
  profesionalId: string | null;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default function ImportarHorariosClient({ filas, profesionales }: { filas: Fila[]; profesionales: { id: string; nombre: string }[] }) {
  const [eleccion, setEleccion] = useState<Record<string, string>>(
    Object.fromEntries(filas.map((f) => [f.clave, f.profesionalId ?? ""])),
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const elegidas = filas.filter((f) => eleccion[f.clave]);
  const sinSede = filas.some((f) => !f.sedeNombre);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/importar-horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignaciones: elegidas.map((f) => ({ clave: f.clave, profesionalId: eleccion[f.clave] })) }),
      });
      const json = await res.json();
      setMensaje(res.ok ? { ok: true, texto: `Listo: ${json.aplicados.length} horarios guardados. Ya se ven en la agenda y en las reservas.` } : { ok: false, texto: json.error || "No se pudo guardar." });
    } catch {
      setMensaje({ ok: false, texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {sinSede && <p className="text-sm text-red-600">No encuentro alguna de las sedes por su nombre: revisa los nombres en Mi barbería.</p>}
      {(["ciudades", "molinos"] as const).map((sede) => (
        <div key={sede} className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-stone-500">
            {filas.find((f) => f.sede === sede)?.sedeNombre ?? (sede === "ciudades" ? "Avenida de las Ciudades" : "Los Molinos")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {filas
              .filter((f) => f.sede === sede)
              .map((f) => (
                <div key={f.clave} className="rounded border border-stone-100 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">{f.nombre}</span>
                    <span className="text-stone-300">→</span>
                    <select
                      value={eleccion[f.clave]}
                      onChange={(e) => setEleccion({ ...eleccion, [f.clave]: e.target.value })}
                      className={"rounded border px-2 py-1 text-sm " + (eleccion[f.clave] ? "border-stone-300" : "border-red-300 bg-red-50")}
                    >
                      <option value="">— No aplicar —</option>
                      {profesionales.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {ORDEN.map((d) => {
                        const t = f.turnos.find((x) => x.dia === d);
                        return (
                          <tr key={d} className="border-t border-stone-50">
                            <td className="py-0.5 pr-2 text-stone-500">{DIAS[d]}</td>
                            <td className="py-0.5 text-stone-800">
                              {t ? `${t.inicio} – ${t.fin}` : <span className="text-stone-300">No trabaja</span>}
                              {t?.descanso && <span className="text-stone-400"> · descanso {t.descanso[0]}–{t.descanso[1]}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <button
          onClick={guardar}
          disabled={guardando || elegidas.length === 0 || sinSede}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? "Guardando…" : `Guardar horarios (${elegidas.length})`}
        </button>
        {elegidas.length < filas.length && <span className="text-xs text-red-600">{filas.length - elegidas.length} sin barbero: no se aplicarán.</span>}
        {mensaje && <span className={"text-sm " + (mensaje.ok ? "text-emerald-700" : "text-red-600")}>{mensaje.texto}</span>}
      </div>
    </div>
  );
}
