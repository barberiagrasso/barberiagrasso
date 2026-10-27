"use client";

import { useState } from "react";

interface Sede {
  id: string;
  nombre: string;
  acepta_tarjeta: boolean;
  acceso_movilidad_reducida: boolean;
  wifi: boolean;
  apto_ninos: boolean;
}

interface ResenaExterna {
  url: string | null;
  url_escribir: string | null;
  nota: number | null;
  total: number | null;
}
type ResenasExternas = Record<string, { booksy?: ResenaExterna; google?: ResenaExterna }>;

const CASILLAS: { clave: keyof Omit<Sede, "id" | "nombre">; label: string }[] = [
  { clave: "acepta_tarjeta", label: "Se aceptan tarjetas" },
  { clave: "acceso_movilidad_reducida", label: "Acceso para movilidad reducida" },
  { clave: "wifi", label: "Wifi" },
  { clave: "apto_ninos", label: "Apto para niños" },
];

/**
 * Checklist de "normas y servicios del local" por sede, inspirado en la
 * ficha de negocio de Booksy (pedido de Diego 19/10/2026): se marcan
 * aquí y se muestran al cliente en el paso "Elige tu sede" de /reservar,
 * como un pequeño sello de confianza más. Cada casilla guarda en cuanto
 * se toca, sin botón de "Guardar" aparte — son pocos datos y el cambio
 * es inmediato.
 */
export default function SedesClient({
  sedes: inicial,
  resenasExternas,
}: {
  sedes: Sede[];
  resenasExternas: ResenasExternas;
}) {
  const [sedes, setSedes] = useState(inicial);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function alternar(sedeId: string, clave: keyof Omit<Sede, "id" | "nombre">, valor: boolean) {
    setSedes((prev) => prev.map((s) => (s.id === sedeId ? { ...s, [clave]: valor } : s)));
    setGuardandoId(sedeId);
    setErrorId(null);
    const res = await fetch(`/api/admin/sedes/${sedeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [clave]: valor }),
    });
    setGuardandoId(null);
    if (!res.ok) {
      // Revierte si falló el guardado, para que la casilla no mienta.
      setSedes((prev) => prev.map((s) => (s.id === sedeId ? { ...s, [clave]: !valor } : s)));
      setErrorId(sedeId);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Estas casillas se muestran al cliente al elegir sede en la reserva, como ficha de confianza del local
        (igual que hace Booksy con sus negocios). No afectan a nada más.
      </p>
      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {sedes.map((sede) => (
          <div key={sede.id} className="p-3">
            <div className="mb-2 font-medium text-stone-900">{sede.nombre}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CASILLAS.map((c) => (
                <label key={c.clave} className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="accent-brand-yellow-dark"
                    checked={sede[c.clave]}
                    disabled={guardandoId === sede.id}
                    onChange={(e) => alternar(sede.id, c.clave, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            {errorId === sede.id && <p className="mt-1 text-xs text-red-600">No se pudo guardar, inténtalo otra vez.</p>}
            <ResenasSede sedeId={sede.id} inicial={resenasExternas[sede.id] ?? {}} />
          </div>
        ))}
        {sedes.length === 0 && <p className="p-3 text-sm text-stone-400">No se encontraron sedes.</p>}
      </div>
    </div>
  );
}

const CAMPO = "w-full rounded border border-stone-300 p-2 text-sm";

/**
 * Nota, nº de reseñas y enlaces de Booksy y Google de una sede (pedido de
 * Diego, 27/10/2026). La nota y los enlaces se enseñan al cliente en la
 * portada; el enlace "para escribir una reseña" de Google es al que se
 * invita a todos los clientes después de valorar su visita en la app.
 */
function ResenasSede({ sedeId, inicial }: { sedeId: string; inicial: { booksy?: ResenaExterna; google?: ResenaExterna } }) {
  const [booksyUrl, setBooksyUrl] = useState(inicial.booksy?.url ?? "");
  const [booksyNota, setBooksyNota] = useState(inicial.booksy?.nota != null ? String(inicial.booksy.nota) : "");
  const [booksyTotal, setBooksyTotal] = useState(inicial.booksy?.total != null ? String(inicial.booksy.total) : "");
  const [googleUrl, setGoogleUrl] = useState(inicial.google?.url ?? "");
  const [googleEscribir, setGoogleEscribir] = useState(inicial.google?.url_escribir ?? "");
  const [googleNota, setGoogleNota] = useState(inicial.google?.nota != null ? String(inicial.google.nota) : "");
  const [googleTotal, setGoogleTotal] = useState(inicial.google?.total != null ? String(inicial.google.total) : "");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  async function guardar() {
    setEstado("guardando");
    setMensajeError(null);
    const res = await fetch(`/api/admin/sedes/${sedeId}/resenas-externas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booksy: { url: booksyUrl, nota: booksyNota, total: booksyTotal },
        google: { url: googleUrl, url_escribir: googleEscribir, nota: googleNota, total: googleTotal },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado("error");
      setMensajeError(json.error || "No se pudo guardar.");
      return;
    }
    setEstado("ok");
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg bg-stone-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Reseñas en Booksy y Google</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_7rem]">
        <input value={booksyUrl} onChange={(e) => setBooksyUrl(e.target.value)} placeholder="Enlace a tu perfil de Booksy" className={CAMPO} />
        <input value={booksyNota} onChange={(e) => setBooksyNota(e.target.value)} placeholder="Nota (4,9)" inputMode="decimal" className={CAMPO} />
        <input value={booksyTotal} onChange={(e) => setBooksyTotal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Nº reseñas" inputMode="numeric" className={CAMPO} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_7rem]">
        <input value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="Enlace a tu ficha de Google Maps" className={CAMPO} />
        <input value={googleNota} onChange={(e) => setGoogleNota(e.target.value)} placeholder="Nota (4,8)" inputMode="decimal" className={CAMPO} />
        <input value={googleTotal} onChange={(e) => setGoogleTotal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Nº reseñas" inputMode="numeric" className={CAMPO} />
      </div>
      <input
        value={googleEscribir}
        onChange={(e) => setGoogleEscribir(e.target.value)}
        placeholder="Enlace de Google para escribir una reseña (g.page/r/…/review)"
        className={CAMPO}
      />
      <p className="text-xs text-stone-400">
        El enlace para escribir reseña lo sacas en Google Business Profile → &ldquo;Pedir reseñas&rdquo;. Tras valorar su visita en
        la app, se invita a todos los clientes a dejarla también en Google.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={estado === "guardando"}
          className="rounded-none bg-brand-black px-3 py-1.5 text-sm font-medium text-brand-white transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {estado === "guardando" ? "Guardando…" : "Guardar reseñas"}
        </button>
        {estado === "ok" && <span className="text-sm text-emerald-700">Guardado</span>}
        {estado === "error" && <span className="text-sm text-red-600">{mensajeError}</span>}
      </div>
    </div>
  );
}
