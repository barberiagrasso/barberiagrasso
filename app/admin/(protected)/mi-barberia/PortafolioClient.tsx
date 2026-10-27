"use client";

import { useMemo, useRef, useState } from "react";

interface Foto {
  id: string;
  url: string;
  servicio_id: string | null;
  sede_id: string | null;
  descripcion: string | null;
  created_at: string;
}
interface Opcion {
  id: string;
  nombre: string;
}

// Lado más largo de la foto ya reducida: se ve nítida en cualquier móvil
// y pesa unos cientos de KB en vez de varios MB.
const LADO_MAXIMO_PX = 1600;
const CALIDAD_JPEG = 0.85;

/** Reduce la foto en el navegador y la devuelve como JPEG en base64. */
async function reducirFoto(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin canvas");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD_JPEG);
  return dataUrl.split(",")[1] ?? "";
}

/**
 * Portafolio de trabajos (pedido de Diego, 27/10/2026): Diego sube aquí
 * las fotos y, opcionalmente, indica de qué servicio y de qué sede son.
 * El cliente las ve en /portafolio y en el botón "Ver trabajos" de cada
 * servicio al reservar. Solo rol "admin".
 */
export default function PortafolioClient({
  fotosIniciales,
  servicios,
  sedes,
}: {
  fotosIniciales: Foto[];
  servicios: Opcion[];
  sedes: Opcion[];
}) {
  const [fotos, setFotos] = useState(fotosIniciales);
  const [servicioId, setServicioId] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const inputRef = useRef<HTMLInputElement>(null);

  const nombreServicio = useMemo(() => new Map(servicios.map((s) => [s.id, s.nombre])), [servicios]);
  const nombreSede = useMemo(() => new Map(sedes.map((s) => [s.id, s.nombre])), [sedes]);

  const fotosVisibles =
    filtro === "todos" ? fotos : filtro === "sin" ? fotos.filter((f) => !f.servicio_id) : fotos.filter((f) => f.servicio_id === filtro);

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const lista = Array.from(archivos);
    setError(null);
    setProgreso({ hechas: 0, total: lista.length });
    const fallidas: string[] = [];
    for (let i = 0; i < lista.length; i++) {
      try {
        const imagenBase64 = await reducirFoto(lista[i]);
        const res = await fetch("/api/admin/portafolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagenBase64, tipoMime: "image/jpeg", servicioId, sedeId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.foto) throw new Error(json.error || "Error");
        setFotos((prev) => [json.foto as Foto, ...prev]);
      } catch (err) {
        fallidas.push(lista[i].name);
        if (fallidas.length === 1 && err instanceof Error && err.message.includes("script")) setError(err.message);
      }
      setProgreso({ hechas: i + 1, total: lista.length });
    }
    setProgreso(null);
    if (inputRef.current) inputRef.current.value = "";
    if (fallidas.length > 0) {
      setError((prev) => prev ?? `No se pudieron subir ${fallidas.length} foto(s): ${fallidas.join(", ")}`);
    }
  }

  async function borrar(foto: Foto) {
    if (!window.confirm("¿Borrar esta foto del portafolio?")) return;
    const res = await fetch(`/api/admin/portafolio/${foto.id}`, { method: "DELETE" });
    if (res.ok) setFotos((prev) => prev.filter((f) => f.id !== foto.id));
    else setError("No se pudo borrar la foto.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Sube fotos de vuestros trabajos. Si eliges un servicio, aparecerán en su botón &ldquo;Ver trabajos&rdquo; al
        reservar; todas salen en la página de trabajos que ven los clientes.
      </p>

      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-sm text-stone-600">
            Servicio (opcional)
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              className="mt-1 w-full rounded border border-stone-300 p-2 text-sm"
            >
              <option value="">Sin servicio concreto</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-600">
            Sede (opcional)
            <select
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              className="mt-1 w-full rounded border border-stone-300 p-2 text-sm"
            >
              <option value="">Las dos sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => subir(e.target.files)}
        />
        <button
          type="button"
          disabled={progreso !== null}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-none bg-brand-black px-4 py-3 text-sm font-semibold text-brand-white transition-opacity hover:opacity-85 disabled:opacity-60 sm:w-auto"
        >
          {progreso ? `Subiendo ${progreso.hechas} de ${progreso.total}…` : "+ Subir fotos"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500">Ver:</span>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded border border-stone-300 p-1.5 text-sm">
          <option value="todos">Todas ({fotos.length})</option>
          <option value="sin">Sin servicio</option>
          {servicios
            .filter((s) => fotos.some((f) => f.servicio_id === s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
        </select>
      </div>

      {fotosVisibles.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-400">Todavía no hay fotos aquí.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {fotosVisibles.map((foto) => (
            <div key={foto.id} className="group relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.descripcion ?? "Trabajo"} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] text-white">
                {foto.servicio_id ? nombreServicio.get(foto.servicio_id) ?? "Servicio" : "Sin servicio"}
                {foto.sede_id ? ` · ${nombreSede.get(foto.sede_id) ?? ""}` : ""}
              </div>
              <button
                type="button"
                onClick={() => borrar(foto)}
                aria-label="Borrar foto"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-red-600"
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
