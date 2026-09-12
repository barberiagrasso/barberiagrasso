"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [email, setEmail] = useState("");
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) {
      setError("Email o contraseña incorrectos.");
      return;
    }
    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold text-stone-900">Panel de control</h1>
      <p className="mb-6 text-sm text-stone-500">Barbería Grasso</p>
      <form onSubmit={iniciarSesion} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-stone-300 p-3"
        />
        <input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-stone-300 p-3"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={cargando}
          className="w-full rounded-lg bg-amber-800 p-3 font-medium text-white disabled:opacity-50"
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-xs text-stone-400">
        ¿No tienes acceso todavía? Créalo desde Supabase Authentication y añádete a la tabla
        `admins` (ver README, sección &quot;Crea tu usuario administrador&quot;).
      </p>
    </main>
  );
}
