"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { reducirFoto } from "@/lib/imagenes";
import { Spinner } from "@/components/ui/Spinner";

interface Resultado {
  hayCara: boolean;
  motivoSinCara?: string;
  formaCara: string;
  explicacionForma: string;
  tipoPelo: string;
  cortes: { nombre: string; porQue: string }[];
  evitar: string[];
  barba: { recomendacion: string; porQue: string } | null;
  extras: { nombre: string; porQue: string; precio: string | null }[];
  consejo: string;
  servicios: { id: string; nombre: string }[];
}

const FORMA_TEXTO: Record<string, string> = {
  ovalada: "Ovalada",
  redonda: "Redonda",
  cuadrada: "Cuadrada",
  rectangular: "Rectangular",
  alargada: "Alargada",
  triangular: "Triangular",
  diamante: "Diamante",
  corazon: "Corazón",
};

const ESTILOS = [
  { id: "clasico", texto: "Clásico" },
  { id: "moderno", texto: "Moderno" },
  { id: "comodo", texto: "Cómodo" },
  { id: "atrevido", texto: "Atrevido" },
];
const BARBAS = [
  { id: "si", texto: "Con barba" },
  { id: "no", texto: "Afeitado" },
  { id: "quiero_probar", texto: "Quiero probar" },
];

const CHIP = "rounded-full border px-3 py-1.5 font-body text-sm transition-colors";

export default function AsesorEstilo() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<string | null>(null); // base64 reducida, solo en memoria
  const [estilo, setEstilo] = useState<string | null>(null);
  const [barba, setBarba] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    setResultado(null);
    try {
      setFoto(await reducirFoto(archivo, 1024));
    } catch {
      setError("No he podido leer esa foto. Prueba con otra.");
    }
  }

  async function analizar() {
    if (!foto || !acepta || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/visagismo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: foto, estilo, barba, consentimiento: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No he podido analizar la foto.");
      setResultado(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No he podido analizar la foto.");
    } finally {
      setCargando(false);
    }
  }

  function empezarDeNuevo() {
    setFoto(null);
    setResultado(null);
    setError(null);
  }

  // --- Resultado ---
  if (resultado?.hayCara) {
    const nota = [
      `Estilo IA: ${resultado.cortes[0]?.nombre ?? ""}`,
      resultado.barba ? `Barba: ${resultado.barba.recomendacion}` : "",
      resultado.extras.length ? `Ofrecer: ${resultado.extras.map((e) => e.nombre).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-brand-yellow/40 bg-brand-yellow/10 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-yellow">Tu cara</p>
          <p className="mt-1 font-heading text-2xl italic text-brand-white">{FORMA_TEXTO[resultado.formaCara] ?? resultado.formaCara}</p>
          <p className="mt-1 font-body text-sm text-brand-white-dim">{resultado.explicacionForma}</p>
          {resultado.tipoPelo && <p className="mt-2 font-body text-sm text-brand-white-dim">Pelo: {resultado.tipoPelo}</p>}
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-yellow">Cortes que te favorecen</p>
          {resultado.cortes.map((c, i) => (
            <div key={i} className="rounded-xl bg-white p-4">
              <p className="font-heading text-lg text-black">
                {i + 1}. {c.nombre}
              </p>
              <p className="mt-0.5 font-body text-sm text-black/60">{c.porQue}</p>
            </div>
          ))}
        </div>

        {resultado.barba && (
          <div className="rounded-xl bg-white p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-black/50">Barba</p>
            <p className="mt-1 font-heading text-lg text-black">{resultado.barba.recomendacion}</p>
            <p className="mt-0.5 font-body text-sm text-black/60">{resultado.barba.porQue}</p>
          </div>
        )}

        {resultado.extras.length > 0 && (
          <div className="rounded-xl border border-brand-yellow/40 p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-brand-yellow">Te recomendamos también</p>
            {resultado.extras.map((e, i) => (
              <div key={i} className="mt-2">
                <p className="font-body text-sm font-semibold text-brand-white">
                  {e.nombre}
                  {e.precio && <span className="ml-2 font-normal text-brand-yellow">{e.precio}</span>}
                </p>
                <p className="font-body text-xs text-brand-white-dim">{e.porQue}</p>
              </div>
            ))}
            <p className="mt-2 font-body text-xs text-brand-white-dim">Pídeselo a tu barbero en la cita o añádelo al reservar.</p>
          </div>
        )}

        {resultado.evitar.length > 0 && (
          <p className="font-body text-sm text-brand-white-dim">
            <span className="text-brand-white">Mejor evitar:</span> {resultado.evitar.join(" · ")}
          </p>
        )}
        {resultado.consejo && (
          <p className="font-body text-sm text-brand-white-dim">
            <span className="text-brand-white">Consejo:</span> {resultado.consejo}
          </p>
        )}

        <Link
          href={`/reservar?nota=${encodeURIComponent(nota)}`}
          className="block w-full bg-brand-white p-3 text-center font-body text-sm font-semibold uppercase tracking-wide text-brand-black"
        >
          Reservar este estilo
        </Link>
        <p className="text-center font-body text-xs text-brand-white-dim">
          Tu barbero verá esta recomendación en tu cita. Es una orientación de la IA: él te asesora en persona.
        </p>
        <button onClick={empezarDeNuevo} className="w-full font-body text-xs text-brand-white-dim underline underline-offset-4">
          Probar con otra foto
        </button>
      </div>
    );
  }

  // --- Formulario ---
  return (
    <div className="mt-6 space-y-5">
      <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={elegirFoto} />

      {foto ? (
        <div className="relative overflow-hidden rounded-2xl border border-brand-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/jpeg;base64,${foto}`} alt="Tu foto" className="max-h-80 w-full object-cover" />
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 font-body text-xs text-white"
          >
            Cambiar foto
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-yellow/50 p-8 text-center"
        >
          <span className="text-4xl">🤳</span>
          <span className="font-body text-sm font-semibold text-brand-white">Hazte un selfie</span>
          <span className="font-body text-xs text-brand-white-dim">De frente, con buena luz, sin gorra ni gafas de sol y con el pelo despejado.</span>
        </button>
      )}

      {resultado && !resultado.hayCara && (
        <p className="rounded-lg border border-brand-yellow/30 p-3 font-body text-sm text-brand-white-dim">
          {resultado.motivoSinCara || "No he visto bien tu cara."} Prueba con otro selfie de frente y con buena luz.
        </p>
      )}

      <div>
        <p className="mb-2 font-body text-sm text-brand-white">¿Qué estilo buscas? <span className="text-brand-white-dim">(opcional)</span></p>
        <div className="flex flex-wrap gap-2">
          {ESTILOS.map((e) => (
            <button
              key={e.id}
              onClick={() => setEstilo(estilo === e.id ? null : e.id)}
              className={CHIP + (estilo === e.id ? " border-brand-yellow bg-brand-yellow text-brand-yellow-ink" : " border-brand-line text-brand-white-dim")}
            >
              {e.texto}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-body text-sm text-brand-white">¿Y la barba? <span className="text-brand-white-dim">(opcional)</span></p>
        <div className="flex flex-wrap gap-2">
          {BARBAS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBarba(barba === b.id ? null : b.id)}
              className={CHIP + (barba === b.id ? " border-brand-yellow bg-brand-yellow text-brand-yellow-ink" : " border-brand-line text-brand-white-dim")}
            >
              {b.texto}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2 font-body text-xs text-brand-white-dim">
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 accent-brand-yellow" />
        <span>
          Acepto que mi foto se envíe a nuestro proveedor de IA solo para este análisis. No se guarda en ningún sitio.{" "}
          <Link href="/politica-privacidad" target="_blank" className="underline">
            Privacidad
          </Link>
        </span>
      </label>

      {error && <p className="font-body text-sm text-red-400">{error}</p>}

      <button
        onClick={analizar}
        disabled={!foto || !acepta || cargando}
        className="flex w-full items-center justify-center gap-2 bg-brand-white p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-black disabled:opacity-40"
      >
        {cargando && <Spinner />}
        {cargando ? "Analizando tu cara…" : "Descubrir mi estilo"}
      </button>
    </div>
  );
}
