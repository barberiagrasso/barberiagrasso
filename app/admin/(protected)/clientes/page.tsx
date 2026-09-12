"use client";

import { Fragment, useEffect, useState } from "react";

interface ClienteFila {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  notas: string | null;
  created_at: string;
  sede_habitual: { nombre: string } | null;
  consentimiento_comercial: boolean;
  tiene_cuenta: boolean;
}

interface CitaHistorial {
  id: string;
  inicio: string;
  estado: string;
  origen: string;
  sede: { nombre: string } | null;
  servicio: { nombre: string; precio_centimos: number } | null;
  profesional: { nombre: string } | null;
  extras: { precio_centimos: number; servicio: { nombre: string } | null }[];
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_presentada: "No presentada",
};

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [historiales, setHistoriales] = useState<Record<string, CitaHistorial[] | "cargando">>({});

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [altaError, setAltaError] = useState<string | null>(null);
  const [altaEnviando, setAltaEnviando] = useState(false);

  function cargarClientes() {
    setCargando(true);
    fetch(`/api/admin/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json())
      .then((j) => setClientes(j.clientes ?? []))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    const t = setTimeout(cargarClientes, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function alternarHistorial(id: string) {
    if (expandido === id) {
      setExpandido(null);
      return;
    }
    setExpandido(id);
    if (!historiales[id]) {
      setHistoriales((actual) => ({ ...actual, [id]: "cargando" }));
      fetch(`/api/admin/clientes/${id}/citas`)
        .then((r) => r.json())
        .then((j) => setHistoriales((actual) => ({ ...actual, [id]: j.citas ?? [] })))
        .catch(() => setHistoriales((actual) => ({ ...actual, [id]: [] })));
    }
  }

  async function registrarClienteManual(e: React.FormEvent) {
    e.preventDefault();
    setAltaEnviando(true);
    setAltaError(null);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: altaNombre, telefono: altaTelefono }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAltaError(json.error || "No se pudo registrar el cliente.");
        return;
      }
      setAltaNombre("");
      setAltaTelefono("");
      setMostrarAlta(false);
      cargarClientes();
    } catch {
      setAltaError("No se pudo conectar con el servidor.");
    } finally {
      setAltaEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-stone-900">Clientes (CRM)</h1>
        <button
          onClick={() => setMostrarAlta((v) => !v)}
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          {mostrarAlta ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </div>

      {mostrarAlta && (
        <form
          onSubmit={registrarClienteManual}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-stone-500">Nombre</label>
            <input
              required
              value={altaNombre}
              onChange={(e) => setAltaNombre(e.target.value)}
              className="rounded-lg border border-stone-300 p-2 text-sm"
              placeholder="Nombre y apellidos"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">Teléfono</label>
            <input
              required
              value={altaTelefono}
              onChange={(e) => setAltaTelefono(e.target.value)}
              className="rounded-lg border border-stone-300 p-2 text-sm"
              placeholder="612 345 678"
            />
          </div>
          <button
            disabled={altaEnviando}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {altaEnviando ? "Registrando…" : "Registrar"}
          </button>
          {altaError && <p className="text-sm text-red-600">{altaError}</p>}
          <p className="w-full text-xs text-stone-400">
            Para cuando alguien pide cita por teléfono — solo hace falta el nombre y el número.
            Si esa persona se registra más adelante en la app con este mismo teléfono, su cuenta se
            enlazará sola con esta ficha y con todo lo que le reserves mientras tanto.
          </p>
        </form>
      )}

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
              <th className="w-8 p-3"></th>
              <th className="p-3">Nombre</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Sede habitual</th>
              <th className="p-3">Cuenta</th>
              <th className="p-3">Comunicaciones comerciales</th>
              <th className="p-3">Cliente desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {clientes.map((c) => {
              const abierto = expandido === c.id;
              const historial = historiales[c.id];
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="p-3">
                      <button
                        onClick={() => alternarHistorial(c.id)}
                        aria-label="Ver historial de citas"
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-900"
                      >
                        {abierto ? "−" : "+"}
                      </button>
                    </td>
                    <td className="p-3 font-medium text-stone-900">{c.nombre}</td>
                    <td className="p-3 text-stone-600">{c.telefono}</td>
                    <td className="p-3 text-stone-600">{c.sede_habitual?.nombre ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={
                          "rounded-full px-2 py-1 text-xs " +
                          (c.tiene_cuenta ? "bg-blue-100 text-blue-700" : "bg-stone-100 text-stone-500")
                        }
                      >
                        {c.tiene_cuenta ? "Con cuenta" : "Sin cuenta"}
                      </span>
                    </td>
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
                  {abierto && (
                    <tr key={`${c.id}-historial`}>
                      <td colSpan={7} className="bg-stone-50 p-4">
                        {historial === "cargando" && (
                          <p className="text-sm text-stone-500">Cargando historial…</p>
                        )}
                        {historial && historial !== "cargando" && historial.length === 0 && (
                          <p className="text-sm text-stone-500">Todavía no tiene citas.</p>
                        )}
                        {historial && historial !== "cargando" && historial.length > 0 && (
                          <ul className="space-y-2">
                            {historial.map((cita) => {
                              const total =
                                (cita.servicio?.precio_centimos ?? 0) +
                                cita.extras.reduce((acc, e) => acc + e.precio_centimos, 0);
                              return (
                                <li
                                  key={cita.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3"
                                >
                                  <div>
                                    <p className="font-medium text-stone-900">
                                      {cita.servicio?.nombre ?? "Servicio"}
                                      {cita.extras.length > 0 &&
                                        ` + ${cita.extras.map((e) => e.servicio?.nombre).filter(Boolean).join(", ")}`}
                                    </p>
                                    <p className="text-xs text-stone-500">
                                      {new Date(cita.inicio).toLocaleString("es-ES", {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                        timeZone: "Europe/Madrid",
                                      })}{" "}
                                      · {cita.sede?.nombre} · {cita.profesional?.nombre ?? "Cualquiera"}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs uppercase tracking-wide text-stone-500">
                                      {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                                    </p>
                                    <p className="font-mono text-sm text-stone-900">{formatearPrecio(total)}</p>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
