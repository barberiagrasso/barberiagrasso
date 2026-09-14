"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CambiarPasswordForm({ obligatorio }: { obligatorio: boolean }) {
  const router = useRouter();
  const [passwordNueva, setPasswordNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (passwordNueva !== repetir) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/admin/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordNueva }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo cambiar la contraseña.");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-brand-line bg-brand-black-soft/60 p-6">
      <input
        required
        type="password"
        placeholder="Contraseña nueva (mínimo 8 caracteres)"
        value={passwordNueva}
        onChange={(e) => setPasswordNueva(e.target.value)}
        className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
      />
      <input
        required
        type="password"
        placeholder="Repite la contraseña"
        value={repetir}
        onChange={(e) => setRepetir(e.target.value)}
        className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
      />

      {error && <p className="font-body text-sm text-red-400">{error}</p>}

      <button
        disabled={cargando}
        className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
      >
        {cargando ? "Un momento…" : "Guardar contraseña"}
      </button>

      {!obligatorio && (
        <button
          type="button"
          onClick={() => router.push("/admin/dashboard")}
          className="w-full font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}
