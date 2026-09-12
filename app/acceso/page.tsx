"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GrassoMark } from "@/components/brand/GrassoMark";

type Modo = "login" | "registro";

export default function AccesoPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("login");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

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
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoMark className="h-14 w-14 text-brand-yellow" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">
            {modo === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-white-dim">Barbería Grasso</p>
        </div>

        <div className="mb-5 flex rounded-full border border-brand-line p-1">
          <button
            type="button"
            onClick={() => {
              setModo("login");
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
              setModo("registro");
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

          {error && <p className="font-body text-sm text-red-400">{error}</p>}

          <button
            disabled={cargando}
            className="w-full rounded-full bg-brand-yellow p-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:opacity-50"
          >
            {cargando ? "Un momento…" : modo === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center font-body text-xs text-brand-white-dim">
          {modo === "login"
            ? "¿Primera vez por aquí? Crea tu cuenta arriba — tardas menos de un minuto."
            : "Tu cuenta se usa solo para gestionar tus citas en Barbería Grasso."}
        </p>
      </div>
    </main>
  );
}
