"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import InstalarApp from "@/components/pwa/InstalarApp";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";

type Modo = "login" | "registro" | "recuperar-telefono" | "recuperar-codigo";

const MODOS_VALIDOS: Modo[] = ["login", "registro", "recuperar-telefono", "recuperar-codigo"];

export default function AccesoPage() {
  return (
    <Suspense fallback={null}>
      <AccesoForm />
    </Suspense>
  );
}

function AccesoForm() {
  const router = useRouter();
  const params = useSearchParams();

  // El modo (login / crear cuenta / recuperar...) vive en la URL en vez
  // de en un useState suelto: así, al cambiar de pestaña se añade una
  // entrada al historial del navegador y el botón "atrás" del móvil
  // vuelve al paso anterior de este mismo formulario en vez de sacarte
  // de la pantalla de acceso directamente.
  const modoParam = params.get("modo");
  const modo: Modo = MODOS_VALIDOS.includes(modoParam as Modo) ? (modoParam as Modo) : "login";

  // A dónde volver después de iniciar sesión (o registrarte, o
  // recuperar la contraseña): la página que te mandó aquí porque hacía
  // falta sesión (ver requireCliente en lib/clienteAuth.ts), o la home
  // si has entrado directamente en /acceso.
  const next = rutaSiguienteSegura(params.get("next"), "/");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function irAModo(nuevoModo: Modo) {
    const qs = new URLSearchParams();
    if (nuevoModo !== "login") qs.set("modo", nuevoModo);
    if (next !== "/") qs.set("next", next);
    const cadena = qs.toString();
    router.push(cadena ? `/acceso?${cadena}` : "/acceso");
  }

  function irALogin() {
    irAModo("login");
    setError(null);
    setAviso(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(modo === "login" ? "/api/auth/login" : "/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "login" ? { telefono, password } : { nombre, telefono, email, password }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Algo no ha ido bien. Inténtalo de nuevo.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Algo no ha ido bien. Inténtalo de nuevo.");
        return;
      }
      setAviso(json.mensaje || "Si ese número tiene una cuenta, te hemos enviado un código por WhatsApp.");
      irAModo("recuperar-codigo");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/auth/recuperar/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, codigo, passwordNueva }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Algo no ha ido bien. Inténtalo de nuevo.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  const esRecuperar = modo === "recuperar-telefono" || modo === "recuperar-codigo";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-black px-4">
      <HeroBackdrop />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-36 text-brand-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">
            {modo === "login" && "Bienvenido de nuevo"}
            {modo === "registro" && "Crea tu cuenta"}
            {modo === "recuperar-telefono" && "Recuperar contraseña"}
            {modo === "recuperar-codigo" && "Escribe el código"}
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-white-dim">Cuidamos de tu imagen</p>
        </div>

        <InstalarApp />

        {!esRecuperar && (
          <div className="mb-5 flex rounded-full border border-brand-line p-1">
            <button
              type="button"
              onClick={() => {
                irAModo("login");
                setError(null);
              }}
              className={
                "flex-1 rounded-full py-2 font-body text-sm font-semibold transition-colors " +
                (modo === "login" ? "bg-brand-yellow text-brand-yellow-ink" : "text-brand-white-dim")
              }
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => {
                irAModo("registro");
                setError(null);
              }}
              className={
                "flex-1 rounded-full py-2 font-body text-sm font-semibold transition-colors " +
                (modo === "registro" ? "bg-brand-yellow text-brand-yellow-ink" : "text-brand-white-dim")
              }
            >
              Crear cuenta
            </button>
          </div>
        )}

        {(modo === "login" || modo === "registro") && (
          <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            {modo === "registro" && (
              <input
                required
                placeholder="Nombre y apellidos"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
              />
            )}
            <input
              required
              type="tel"
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
            />
            {modo === "registro" && (
              <input
                type="email"
                placeholder="Email (opcional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
              />
            )}
            <input
              required
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
            />

            {modo === "login" && (
              <button
                type="button"
                onClick={() => {
                  irAModo("recuperar-telefono");
                  setError(null);
                  setAviso(null);
                }}
                className="font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {error && <p className="font-body text-sm text-red-400">{error}</p>}

            <button
              disabled={cargando}
              className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
            >
              {cargando ? "Un momento…" : modo === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        )}

        {modo === "recuperar-telefono" && (
          <form onSubmit={pedirCodigo} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            <p className="font-body text-sm text-brand-white-dim">
              Escribe tu teléfono y te mandamos un código de 6 dígitos por WhatsApp para elegir una contraseña
              nueva.
            </p>
            <input
              required
              type="tel"
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
            />

            {error && <p className="font-body text-sm text-red-400">{error}</p>}

            <button
              disabled={cargando}
              className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
            >
              {cargando ? "Un momento…" : "Enviar código por WhatsApp"}
            </button>
            <button type="button" onClick={irALogin} className="w-full font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow">
              Volver a iniciar sesión
            </button>
          </form>
        )}

        {modo === "recuperar-codigo" && (
          <form onSubmit={confirmarCodigo} className="space-y-3 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
            {aviso && <p className="font-body text-sm text-brand-white-dim">{aviso}</p>}
            <input
              required
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
            />
            <input
              required
              type="password"
              placeholder="Contraseña nueva"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
            />

            {error && <p className="font-body text-sm text-red-400">{error}</p>}

            <button
              disabled={cargando}
              className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
            >
              {cargando ? "Un momento…" : "Cambiar contraseña"}
            </button>
            <button
              type="button"
              onClick={() => {
                irAModo("recuperar-telefono");
                setError(null);
              }}
              className="w-full font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
            >
              Pedir otro código
            </button>
          </form>
        )}

        <p className="mt-6 text-center font-body text-xs text-brand-white-dim">
          {modo === "login" &&
            "¿Primera vez por aquí? Crea tu cuenta arriba — tardas menos de un minuto."}
          {modo === "registro" && "Tu cuenta se usa solo para gestionar tus citas en Barbería Grasso."}
          {esRecuperar && "Recibirás el código en el WhatsApp de tu número, no por email."}
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/admin/login"
            className="font-body text-xs text-brand-white-dim/70 underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            Acceso para el equipo
          </Link>
        </div>
      </div>
    </main>
  );
}
