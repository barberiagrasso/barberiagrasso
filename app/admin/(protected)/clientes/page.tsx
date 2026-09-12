"use client";

import { useEffect, useState } from "react";

interface ClienteFila {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  notas: string | null;
  created_at: string;
  sede_habitual: { nombre: string } | null;
  consentimiento_comercial: boolean;
}

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true);
      fetch(`/api/admin/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => r.json())
        .then((j) => setClientes(j.clientes ?? []))
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-stone-900">Clientes (CRM)</h1>
      <input
        placeholder="Buscar por nombre o teléfono…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-stone-300 p-2 text-sm"
      />

      {cargando && <p className="text-sm text-stone-500">Cargando…</p>}

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-600">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Sede habitual</th>
              <th className="p-3">Comunicaciones comerciales</th>
              <th className="p-3">Cliente desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {clientes.map((c) => (
              <tr key={c.id}>
                <td className="p-3 font-medium text-stone-900">{c.nombre}</td>
                <td className="p-3 text-stone-600">{c.telefono}</td>
                <td className="p-3 text-stone-600">{c.sede_habitual?.nombre ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={
                      "rounded-full px-2 py-1 text-xs " +
                      (c.consentimiento_comercial
                        ? "bg-green-100 text-green-700"
                        : "bg-stone-100 text-stone-500")
                    }
                  >
                    {c.consentimiento_comercial ? "Sí, acepta" : "No"}
                  </span>
                </td>
                <td className="p-3 text-stone-500">
                  {new Date(c.created_at).toLocaleDateString("es-ES")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && clientes.length === 0 && (
          <p className="p-4 text-sm text-stone-500">No hay clientes que coincidan.</p>
        )}
      </div>
      <p className="text-xs text-stone-400">
        Solo se pueden enviar campañas comerciales a los clientes marcados como &quot;Sí, acepta&quot;.
      </p>
    </div>
  );
}
