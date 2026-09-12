"use client";

import { useEffect, useState } from "react";

interface ConversacionResumen {
  id: string;
  telefono: string;
  estado: "ia" | "escalada" | "cerrada";
  updated_at: string;
  cliente: { nombre: string } | null;
}
interface Mensaje {
  id: string;
  remitente: "cliente" | "ia" | "gestor";
  contenido: string;
  created_at: string;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  ia: "Atendido por IA",
  escalada: "Atendido por una persona",
  cerrada: "Cerrada",
};

export default function ConversacionesPage() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargarLista() {
    const res = await fetch("/api/admin/conversaciones");
    const json = await res.json();
    setConversaciones(json.conversaciones ?? []);
  }

  async function cargarConversacion(id: string) {
    setSeleccionada(id);
    const res = await fetch(`/api/admin/conversaciones/${id}`);
    const json = await res.json();
    setMensajes(json.mensajes ?? []);
  }

  useEffect(() => {
    void cargarLista();
    const intervalo = setInterval(cargarLista, 10000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!seleccionada) return;
    const intervalo = setInterval(() => cargarConversacion(seleccionada), 5000);
    return () => clearInterval(intervalo);
  }, [seleccionada]);

  async function enviarRespuesta() {
    if (!seleccionada || !respuesta.trim()) return;
    setEnviando(true);
    await fetch(`/api/admin/conversaciones/${seleccionada}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: respuesta }),
    });
    setRespuesta("");
    setEnviando(false);
    cargarConversacion(seleccionada);
    cargarLista();
  }

  async function devolverAIA() {
    if (!seleccionada) return;
    await fetch(`/api/admin/conversaciones/${seleccionada}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "ia" }),
    });
    cargarLista();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-stone-900">WhatsApp</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white md:col-span-1">
          {conversaciones.map((c) => (
            <button
              key={c.id}
              onClick={() => cargarConversacion(c.id)}
              className={"block w-full p-3 text-left hover:bg-stone-50 " + (seleccionada === c.id ? "bg-brand-yellow/15" : "")}
            >
              <div className="font-medium text-stone-900">{c.cliente?.nombre ?? c.telefono}</div>
              <div className="text-xs text-stone-500">{ETIQUETA_ESTADO[c.estado] ?? c.estado}</div>
            </button>
          ))}
          {conversaciones.length === 0 && <p className="p-3 text-sm text-stone-500">Sin conversaciones todavía.</p>}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 md:col-span-2">
          {!seleccionada && <p className="text-sm text-stone-500">Elige una conversación de la izquierda.</p>}
          {seleccionada && (
            <div className="flex h-[28rem] flex-col">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-stone-500">
                  {ETIQUETA_ESTADO[conversaciones.find((c) => c.id === seleccionada)?.estado ?? ""]}
                </span>
                <button onClick={devolverAIA} className="text-xs text-stone-700 underline hover:text-brand-yellow-dark">
                  Devolver a la IA
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "max-w-[75%] rounded-lg px-3 py-2 text-sm " +
                      (m.remitente === "cliente"
                        ? "bg-stone-100 text-stone-800"
                        : "ml-auto bg-brand-yellow text-brand-yellow-ink")
                    }
                  >
                    {m.contenido}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviarRespuesta()}
                  placeholder="Escribe una respuesta manual…"
                  className="flex-1 rounded-lg border border-stone-300 p-2 text-sm"
                />
                <button
                  disabled={enviando || !respuesta.trim()}
                  onClick={enviarRespuesta}
                  className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
