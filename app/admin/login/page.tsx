"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GrassoMark } from "@/components/brand/GrassoMark";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";
import { Spinner } from "@/components/ui/Spinner";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "no-autorizado"
      ? "Tu usuario existe pero no tiene permisos de administrador todavía."
      : params.get("error") === "inactividad"
        ? "Se cerró tu sesión por inactividad. Vuelve a entrar."
        : null
  );
  const [cargando, setCargando] = useState(false);
  const destino = rutaSiguienteSegura(params.get("next"), "/admin/dashboard");

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    // El login pasa por /api/admin/login (en vez de llamar a Supabase
    // directamente desde el navegador) para que el límite de intentos
    // de lib/rateLimit.ts —el mismo que ya protege el login de
    // clientes— también cubra al panel de administración.
    const usuarioLimpio = usuario.trim();
    try {
      const respuesta = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuarioLimpio, password }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(datos?.error ?? "Email o contraseña incorrectos.");
        setCargando(false);
        return;
      }
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
      setCargando(false);
      return;
    }
    // Si llegaste aquí porque intentaste entrar a una pantalla concreta
    // sin sesión (p. ej. un enlace directo a una conversación de
    // WhatsApp), vuelve ahí en vez de mandarte siempre a la Agenda.
    // La ruedecita sigue girando hasta que aparece esa pantalla (antes
    // el botón volvía a "Entrar" mientras cargaba y parecía colgado), y
    // ya no se llama a router.refresh(): cargaba la página dos veces.
    router.replace(destino);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoMark className="h-14 w-14 text-brand-yellow" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">Panel de control</h1>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-white-dim">Barbería Grasso</p>
        </div>
        <form onSubmit={iniciarSesion} className="space-y-4 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
          <input
            type="text"
            required
            placeholder="Usuario o email"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
          />
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
          />
          {error && <p className="font-body text-sm text-red-400">{error}</p>}
          <button
            disabled={cargando}
            aria-busy={cargando}
            className="flex w-full items-center justify-center gap-2 rounded-none bg-brand-white p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-black transition-opacity hover:opacity-85 disabled:opacity-70"
          >
            {cargando && <Spinner />}
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="mt-6 text-center">
          <Link
            href="/acceso"
            className="font-body text-sm font-semibold text-brand-yellow underline decoration-brand-yellow/50 underline-offset-4 hover:text-brand-yellow-dark"
          >
            ¿Eres cliente? Entra por aquí
          </Link>
        </div>
      </div>
    </main>
  );
}
