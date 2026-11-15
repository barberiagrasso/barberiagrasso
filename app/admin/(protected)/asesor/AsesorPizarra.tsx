"use client";

import { useEffect, useRef, useState } from "react";
import { reducirFoto } from "@/lib/imagenes";
import { CATALOGO_BARBAS, CATALOGO_CORTES, fotoDeEstilo } from "@/lib/catalogoEstilos";

type Punto = { x: number; y: number }; // 0–1, relativo a la foto
type Trazo = { color: string; grosor: number; puntos: Punto[] };

const COLORES = ["#f2d368", "#ffffff", "#ef4444", "#22c55e", "#111111"];
const GROSORES = [{ id: 3, texto: "Fino" }, { id: 7, texto: "Medio" }, { id: 14, texto: "Grueso" }];

interface Analisis {
  hayCara: boolean;
  motivoSinCara?: string;
  formaCara: string;
  explicacionForma: string;
  cortes: { nombre: string; porQue: string }[];
  barba: { recomendacion: string; porQue: string } | null;
}

export default function AsesorPizarra() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dibujando = useRef<Trazo | null>(null);

  const [original, setOriginal] = useState<string | null>(null); // base64
  const [generada, setGenerada] = useState<string | null>(null); // base64 de la IA
  const [verGenerada, setVerGenerada] = useState(true);
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [color, setColor] = useState(COLORES[0]);
  const [grosor, setGrosor] = useState(7);
  const [corte, setCorte] = useState<string | null>(null);
  const [barba, setBarba] = useState<string | null>(null);
  const [detalles, setDetalles] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [probadorActivo, setProbadorActivo] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState<"probar" | "analizar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);

  const base = generada && verGenerada ? generada : original;

  useEffect(() => {
    fetch("/api/admin/asesor/probar")
      .then((r) => r.json())
      .then((j) => setProbadorActivo(Boolean(j.activo)))
      .catch(() => setProbadorActivo(false));
  }, []);

  // Carga la imagen de fondo y redibuja todo cuando cambia algo.
  useEffect(() => {
    if (!base) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      pintar();
    };
    img.src = `data:image/jpeg;base64,${base}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    pintar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trazos]);

  function pintar(extra?: Trazo) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const escala = canvas.width / 600;
    for (const t of extra ? [...trazos, extra] : trazos) {
      if (t.puntos.length === 0) continue;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.grosor * escala;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(t.puntos[0].x * canvas.width, t.puntos[0].y * canvas.height);
      for (const p of t.puntos.slice(1)) ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      if (t.puntos.length === 1) ctx.lineTo(t.puntos[0].x * canvas.width + 0.1, t.puntos[0].y * canvas.height);
      ctx.stroke();
    }
  }

  function punto(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function alBajar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = { color, grosor, puntos: [punto(e)] };
    pintar(dibujando.current);
  }
  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    dibujando.current.puntos.push(punto(e));
    pintar(dibujando.current);
  }
  function alSubir() {
    if (!dibujando.current) return;
    const t = dibujando.current;
    dibujando.current = null;
    setTrazos((ts) => [...ts, t]);
  }

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    try {
      setOriginal(await reducirFoto(archivo, 1280));
      setGenerada(null);
      setTrazos([]);
      setAnalisis(null);
    } catch {
      setError("No se ha podido leer la foto.");
    }
  }

  async function probar() {
    if (!original || !corte || ocupado) return;
    setOcupado("probar");
    setError(null);
    try {
      const res = await fetch("/api/admin/asesor/probar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: original, estilo: corte, barba: barba === "Afeitado" ? "clean shaven, no beard" : barba, detalles, consentimiento: acepta }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se ha podido generar.");
      setGenerada(json.imagenBase64);
      setVerGenerada(true);
      setTrazos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido generar.");
    } finally {
      setOcupado(null);
    }
  }

  async function analizar() {
    if (!original || ocupado) return;
    setOcupado("analizar");
    setError(null);
    try {
      const res = await fetch("/api/admin/asesor/analisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: original, consentimiento: acepta }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se ha podido analizar.");
      setAnalisis(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido analizar.");
    } finally {
      setOcupado(null);
    }
  }

  async function compartir() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const archivo = new File([blob], "estilo-grasso.jpg", { type: "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: "Tu estilo en Grasso" });
          return;
        } catch {
          /* cancelado */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "estilo-grasso.jpg";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/jpeg", 0.9);
  }

  const botonHerramienta = "rounded-lg border px-3 py-2 text-sm";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} />

      {/* --- Pizarra --- */}
      <div className="space-y-3">
        {!original ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-72 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-white text-stone-600"
          >
            <span className="text-4xl">📷</span>
            <span className="font-semibold">Hacer foto al cliente</span>
            <span className="text-xs text-stone-400">De frente, de lado o de espaldas</span>
          </button>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              <canvas
                ref={canvasRef}
                onPointerDown={alBajar}
                onPointerMove={alMover}
                onPointerUp={alSubir}
                onPointerCancel={alSubir}
                className="mx-auto block max-h-[70vh] w-auto max-w-full"
                style={{ touchAction: "none" }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {COLORES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={"h-9 w-9 rounded-full border-2 " + (color === c ? "border-stone-900 ring-2 ring-stone-400" : "border-stone-200")}
                  style={{ background: c }}
                />
              ))}
              {GROSORES.map((g) => (
                <button key={g.id} onClick={() => setGrosor(g.id)} className={botonHerramienta + (grosor === g.id ? " border-stone-900 bg-stone-900 text-white" : " border-stone-300 bg-white")}>
                  {g.texto}
                </button>
              ))}
              <button onClick={() => setTrazos((t) => t.slice(0, -1))} className={botonHerramienta + " border-stone-300 bg-white"}>
                ↶ Deshacer
              </button>
              <button onClick={() => setTrazos([])} className={botonHerramienta + " border-stone-300 bg-white"}>
                Borrar dibujo
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => inputRef.current?.click()} className={botonHerramienta + " border-stone-300 bg-white"}>
                📷 Otra foto
              </button>
              {generada && (
                <button onClick={() => setVerGenerada(!verGenerada)} className={botonHerramienta + " border-stone-300 bg-white"}>
                  {verGenerada ? "Ver antes" : "Ver después (IA)"}
                </button>
              )}
              <button onClick={compartir} className={botonHerramienta + " border-stone-900 bg-stone-900 text-white"}>
                Guardar / mandar al cliente
              </button>
            </div>
          </>
        )}
      </div>

      {/* --- Panel lateral --- */}
      <div className="space-y-4">
        <label className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5" />
          El cliente acepta que su foto se use con la IA para esta consulta (no se guarda).
        </label>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wider text-stone-500">Visagismo</h2>
            <button
              onClick={analizar}
              disabled={!original || !acepta || ocupado !== null}
              className="rounded bg-stone-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              {ocupado === "analizar" ? "Analizando…" : "Analizar cara"}
            </button>
          </div>
          {analisis && !analisis.hayCara && <p className="mt-2 text-sm text-stone-600">{analisis.motivoSinCara || "No se ve bien la cara."}</p>}
          {analisis?.hayCara && (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Cara <b className="capitalize">{analisis.formaCara}</b>: <span className="text-stone-500">{analisis.explicacionForma}</span>
              </p>
              <p className="text-xs text-stone-500">Recomendados (toca para elegir):</p>
              <div className="flex flex-wrap gap-1">
                {analisis.cortes.map((c) => (
                  <button key={c.nombre} onClick={() => setCorte(c.nombre)} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    {c.nombre}
                  </button>
                ))}
                {analisis.barba && (
                  <button onClick={() => setBarba(analisis.barba!.recomendacion)} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    {analisis.barba.recomendacion}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Corte {corte && `· ${corte}`}</h2>
          <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto">
            {CATALOGO_CORTES.map((n) => (
              <Miniatura key={n} nombre={n} activo={corte === n} alPulsar={() => setCorte(corte === n ? null : n)} />
            ))}
          </div>
          <h2 className="mb-2 mt-3 font-mono text-xs uppercase tracking-wider text-stone-500">Barba {barba && `· ${barba}`}</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {CATALOGO_BARBAS.map((n) => (
              <Miniatura key={n} nombre={n} activo={barba === n} alPulsar={() => setBarba(barba === n ? null : n)} />
            ))}
          </div>
          <input
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            placeholder="Detalles (raya a navaja, más largo arriba…)"
            className="mt-3 w-full rounded border border-stone-300 p-2 text-sm"
          />
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <h2 className="font-mono text-xs uppercase tracking-wider text-stone-500">Probador con IA</h2>
          {probadorActivo === false ? (
            <p className="mt-1 text-xs text-stone-500">
              Sin activar todavía: falta poner la clave de Google (GEMINI_API_KEY) en Vercel. Mientras, usa el dibujo y la guía.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-stone-500">Genera una foto del cliente con el corte elegido. Es orientativa (unos céntimos cada una).</p>
              <button
                onClick={probar}
                disabled={!original || !corte || !acepta || ocupado !== null}
                className="mt-2 w-full rounded bg-amber-400 py-2 text-sm font-semibold text-stone-900 disabled:opacity-40"
              >
                {ocupado === "probar" ? "Generando (unos segundos)…" : corte ? `Probar «${corte}»` : "Elige un corte"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Miniatura({ nombre, activo, alPulsar }: { nombre: string; activo: boolean; alPulsar: () => void }) {
  const foto = fotoDeEstilo(nombre);
  return (
    <button onClick={alPulsar} className={"overflow-hidden rounded-lg border-2 text-left " + (activo ? "border-amber-400" : "border-transparent")}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-stone-100 text-xl">🪒</div>
      )}
      <span className="block truncate px-0.5 text-[10px] leading-tight text-stone-700">{nombre}</span>
    </button>
  );
}
