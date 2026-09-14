"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GrassoMark } from "@/components/brand/GrassoMark";
import { emailSinteticoParaUsuarioEquipo } from "@/lib/usuarioEquipo";

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
      : null
  );
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const supabase = createClient();
    // Tu cuenta entra con tu email real; las cuentas de equipo (cada
    // barbero) entran con un usuario sencillo, sin @ — que aquí se
    // traduce al email sintético que espera Supabase Auth por debajo.
    const usuarioLimpio = usuario.trim();
    const emailReal = usuarioLimpio.includes("@")
      ? usuarioLimpio
      : emailSinteticoParaUsuarioEquipo(usuarioLimpio.toLowerCase());
    const { error } = await supabase.auth.signInWithPassword({ email: emailReal, password });
    setCargando(false);
    if (error) {
      setError("Email o contraseña incorrectos.");
      return;
    }
    router.push("/admin/dashboard");
    router.refresh();
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
            className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
          />
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
          />
          {error && <p className="font-body text-sm text-red-400">{error}</p>}
          <button
            disabled={cargando}
            className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-6 text-center font-body text-xs text-brand-white-dim">
          ¿No tienes acceso todavía? Créalo desde Supabase Authentication y añádete a la tabla
          `admins` (ver README, sección &quot;Crea tu usuario administrador&quot;).
        </p>
      </div>
    </main>
  );
}
