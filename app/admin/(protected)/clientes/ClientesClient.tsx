"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  saldo_fidelizacion_centimos: number;
  created_at: string;
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function ClientesClient({ clientesIniciales }: { clientesIniciales: Cliente[] }) {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState(clientesIniciales);
  const [buscando, setBuscando] = useState(false);

  // Búsqueda con un pequeño debounce, igual que la cita rápida del panel:
  // sin él, cada tecla dispararía una petición.
  useEffect(() => {
    const termino = q.trim();
    if (!termino) {
      setClientes(clientesIniciales);
      return;
    }
    setBuscando(true);
    const idTimeout = setTimeout(() => {
      fetch(`/api/admin/clientes?q=${encodeURIComponent(termino)}`)
        .then((r) => r.json())
        .then((j) => setClientes(j.clientes ?? []))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(idTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o teléfono…"
        className="w-full max-w-sm rounded-lg border border-stone-300 p-2 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <th className="p-3">Nombre</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Saldo</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="p-3 font-medium text-stone-800">{c.nombre}</td>
                <td className="p-3 text-stone-600">{c.telefono ?? <span className="italic text-stone-400">Oculto</span>}</td>
                <td className="p-3 font-mono text-stone-700">{formatearPrecio(c.saldo_fidelizacion_centimos)}</td>
                <td className="p-3 text-right">
                  <Link href={`/admin/clientes/${c.id}`} className="text-sm font-medium text-brand-yellow-dark hover:underline">
                    Ver ficha →
                  </Link>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && !buscando && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-stone-400">
                  No se ha encontrado ningún cliente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
