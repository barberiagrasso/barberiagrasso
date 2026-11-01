"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import InstalarApp from "@/components/pwa/InstalarApp";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";
import { Spinner } from "@/components/ui/Spinner";

// Acceso del CLIENTE (01/11/2026): ya no hace falta para reservar. Solo
// para ver "Mi perfil y mis citas" desde un móvil que no le reconoce:
// teléfono → código de 6 dígitos por WhatsApp → dentro, sin contraseña.
// Quien ya tenía contraseña puede seguir entrando con ella.
type Modo = "telefono" | "codigo" | "login" | "recuperar-telefono" | "recuperar-codigo";
const MODOS_VALIDOS: Modo[] = ["telefono", "codigo", "login", "recuperar-telefono", "recuperar-codigo"];

const CAMPO =
  "w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none";
const BOTON =
  "flex w-full items-center justify-center gap-2 rounded-none bg-brand-white p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-black transition-opacity hover:opacity-85 disabled:opacity-70";
const ENLACE = "font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow";

export default function AccesoPage() {
  return (
    <Suspense fallback={null}>
      <AccesoForm />
    </Suspense>
  );
}

function telefonoConPrefijo(t: string) {
  return /^\s*(\+|00)/.test(t) ? t : `+34${t}`;
}

function AccesoForm() {
  const router = useRouter();
  const params = useSearchParams();
  const modoParam = params.get("modo");
  const modo: Modo = MODOS_VALIDOS.includes(modoParam as Modo) ? (modoParam as Modo) : "telefono";
  const next = rutaSiguienteSegura(params.get("next"), "/perfil");

  const [telefono, setTelefono] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Un segundo toque mientras se procesa el primero no hace nada.
  const ocupado = useRef(false);

  function irAModo(nuevo: Modo) {
    const qs = new URLSearchParams();
    if (nuevo !== "telefono") qs.set("modo", nuevo);
    if (next !== "/perfil") qs.set("next", next);
    const cadena = qs.toString();
    // pushState: cambio instantáneo, sin pedir la pantalla al servidor.
    window.history.pushState(null, "", cadena ? `/acceso?${cadena}` : "/acceso");
    setError(null);
  }

  async function llamar(url: string, cuerpo: object): Promise<{ ok: boolean; json: Record<string, unknown> } | null> {
    if (ocupado.current) return null;
    ocupado.current = true;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError((json.error as string) || "Algo no ha ido bien. Inténtalo de nuevo.");
      return { ok: res.ok, json };
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      return null;
    } finally {
      ocupado.current = false;
      setCargando(false);
    }
  }

  async function pedirCodigo(e: React.FormEvent, recuperar = false) {
    e.preventDefault();
    const r = await llamar(recuperar ? "/api/auth/recuperar" : "/api/auth/codigo", { telefono: telefonoConPrefijo(telefono) });
    if (!r?.ok) return;
    setAviso((r.json.mensaje as string) || "Te hemos enviado un código por WhatsApp.");
    setCodigo("");
    irAModo(recuperar ? "recuperar-codigo" : "codigo");
  }

  async function entrarConCodigo(e: React.FormEvent) {
    e.preventDefault();
    const r = await llamar("/api/auth/codigo/confirmar", { telefono: telefonoConPrefijo(telefono), codigo });
    if (r?.ok) {
      setCargando(true); // la ruedecita sigue hasta que cambia la pantalla
      router.replace(next);
    }
  }

  async function entrarConPassword(e: React.FormEvent) {
    e.preventDefault();
    const r = await llamar("/api/auth/login", { telefono: telefonoConPrefijo(telefono), password });
    if (r?.ok) {
      setCargando(true);
      router.replace(next);
    }
  }

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordNueva.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    const r = await llamar("/api/auth/recuperar/confirmar", { telefono: telefonoConPrefijo(telefono), codigo, passwordNueva });
    if (r?.ok) {
      setCargando(true);
      router.replace(next);
    }
  }

  const campoTelefono = (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-brand-line focus-within:border-brand-yellow">
      {!/^\s*(\+|00)/.test(telefono) && (
        <span className="flex items-center border-r border-brand-line px-3 font-body text-brand-white-dim">+34</span>
      )}
      <input
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        name="tel"
        placeholder="Tu teléfono móvil"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value.replace(/^\s*\+34\s*/, ""))}
        className="w-full bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:outline-none"
      />
    </div>
  );

  const campoCodigo = (
    <input
      required
      inputMode="numeric"
      autoComplete="one-time-code"
      name="one-time-code"
      maxLength={6}
      placeholder="Código de 6 dígitos"
      value={codigo}
      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
      className={CAMPO + " text-center text-lg tracking-[0.4em]"}
    />
  );

  const botonEnviar = (texto: string) => (
    <button disabled={cargando} aria-busy={cargando} className={BOTON}>
      {cargando && <Spinner />}
      {cargando ? "Un momento…" : texto}
    </button>
  );

  const titulo: Record<Modo, string> = {
    telefono: "Mis citas",
    codigo: "Escribe el código",
    login: "Entrar con contraseña",
    "recuperar-telefono": "Recuperar contraseña",
    "recuperar-codigo": "Nueva contraseña",
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-black px-4">
      <HeroBackdrop />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-36 text-brand-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">{titulo[modo]}</h1>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-white-dim">Cuidamos de tu imagen</p>
        </div>

        <InstalarApp />

        {modo === "telefono" && (
          <form onSubmit={(e) => pedirCodigo(e)} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            <p className="font-body text-sm text-brand-white-dim">
              Escribe el teléfono con el que reservas y te mandamos un código por WhatsApp. Sin contraseñas.
            </p>
            {campoTelefono}
            {error && <p className="font-body text-sm text-red-400">{error}</p>}
            {botonEnviar("Enviar código")}
            <button type="button" onClick={() => irAModo("login")} className={ENLACE + " w-full"}>
              Tengo contraseña
            </button>
          </form>
        )}

        {modo === "codigo" && (
          <form onSubmit={entrarConCodigo} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            {aviso && <p className="font-body text-sm text-brand-white-dim">{aviso}</p>}
            {campoCodigo}
            {error && <p className="font-body text-sm text-red-400">{error}</p>}
            {botonEnviar("Entrar")}
            <button type="button" onClick={() => irAModo("telefono")} className={ENLACE + " w-full"}>
              Pedir otro código
            </button>
          </form>
        )}

        {modo === "login" && (
          <form onSubmit={entrarConPassword} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            {campoTelefono}
            <input
              required
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={CAMPO}
            />
            {error && <p className="font-body text-sm text-red-400">{error}</p>}
            {botonEnviar("Entrar")}
            <div className="flex justify-between">
              <button type="button" onClick={() => irAModo("telefono")} className={ENLACE}>
                Entrar con código
              </button>
              <button type="button" onClick={() => irAModo("recuperar-telefono")} className={ENLACE}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </form>
        )}

        {modo === "recuperar-telefono" && (
          <form onSubmit={(e) => pedirCodigo(e, true)} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            <p className="font-body text-sm text-brand-white-dim">Te mandamos un código por WhatsApp para elegir una contraseña nueva.</p>
            {campoTelefono}
            {error && <p className="font-body text-sm text-red-400">{error}</p>}
            {botonEnviar("Enviar código por WhatsApp")}
            <button type="button" onClick={() => irAModo("login")} className={ENLACE + " w-full"}>
              Volver
            </button>
          </form>
        )}

        {modo === "recuperar-codigo" && (
          <form onSubmit={cambiarPassword} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            {aviso && <p className="font-body text-sm text-brand-white-dim">{aviso}</p>}
            {campoCodigo}
            <input
              required
              type="password"
              autoComplete="new-password"
              placeholder="Contraseña nueva"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              className={CAMPO}
            />
            {error && <p className="font-body text-sm text-red-400">{error}</p>}
            {botonEnviar("Cambiar contraseña")}
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/reservar" className="font-body text-sm font-semibold text-brand-yellow underline underline-offset-4">
            ¿Solo quieres reservar? No hace falta entrar
          </Link>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/admin/login" className={ENLACE + " text-brand-white-dim/70"}>
            Acceso para el equipo
          </Link>
          <Link href="/politica-privacidad" className={ENLACE + " text-brand-white-dim/70"}>
            Privacidad
          </Link>
        </div>
      </div>
    </main>
  );
}
