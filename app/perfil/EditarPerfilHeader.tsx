"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPencil, IconX, IconCheck } from "@/components/ui/Icons";
import { IconLogOut } from "@/components/ui/Icons";
import { CerrarSesionButton } from "@/components/brand/CerrarSesionButton";

interface ClienteEditable {
  nombre: string;
  telefono: string;
  email: string | null;
  fechaNacimiento: string | null;
}

/**
 * Cabecera de "Mi perfil" reorganizada (pedido de Diego, 19/09/2026):
 * arriba a la derecha solo dos iconos — cerrar sesión y editar perfil.
 * Editar perfil abre este mismo modal para el cumpleaños, el teléfono, el
 * nombre y el email, que antes eran una sección aparte (cumpleaños) o no
 * se podían tocar en absoluto (nombre, teléfono, email).
 */
export function EditarPerfilHeader({ cliente }: { cliente: ClienteEditable }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setAbierto(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-line text-brand-white-dim transition-colors hover:border-brand-yellow hover:text-brand-yellow"
        title="Editar perfil"
        aria-label="Editar perfil"
      >
        <IconPencil className="h-4 w-4" />
      </button>
      <CerrarSesionButton className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-line text-brand-white-dim transition-colors hover:border-red-400 hover:text-red-400">
        <IconLogOut className="h-4 w-4" />
      </CerrarSesionButton>

      {abierto && <ModalEditarPerfil cliente={cliente} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function ModalEditarPerfil({ cliente, onCerrar }: { cliente: ClienteEditable; onCerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono, setTelefono] = useState(cliente.telefono);
  const [email, setEmail] = useState(cliente.email ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(cliente.fechaNacimiento ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim() || !telefono.trim()) {
      setError("El nombre y el teléfono no pueden estar vacíos.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          email: email.trim() || null,
          fechaNacimiento: fechaNacimiento || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "No se pudo guardar.");
        return;
      }
      onCerrar();
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16" onClick={onCerrar}>
      <div
        className="w-full max-w-sm rounded-2xl border border-brand-line bg-brand-black-soft p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg italic text-brand-white">Editar perfil</h2>
          <button onClick={onCerrar} className="text-brand-white-dim hover:text-brand-white" aria-label="Cerrar">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-body text-xs uppercase tracking-widest text-brand-white-dim">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white focus:border-brand-yellow focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs uppercase tracking-widest text-brand-white-dim">Teléfono</span>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white focus:border-brand-yellow focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs uppercase tracking-widest text-brand-white-dim">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white placeholder:text-brand-white-dim/60 focus:border-brand-yellow focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-xs uppercase tracking-widest text-brand-white-dim">Cumpleaños</span>
            <input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              // [color-scheme:dark] hace que el propio selector nativo del
              // navegador (icono y calendario emergente) se pinte en modo
              // oscuro en vez de con los colores claros por defecto, que
              // desentonaban con el resto de la interfaz de marca.
              className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white focus:border-brand-yellow focus:outline-none [color-scheme:dark]"
            />
            <span className="mt-1 block font-body text-xs text-brand-white-dim">
              Cuéntanoslo y te mandamos una sorpresa por WhatsApp ese día. Es opcional.
            </span>
          </label>
        </div>

        {error && <p className="mt-3 font-body text-xs text-red-400">{error}</p>}

        <button
          onClick={guardar}
          disabled={guardando}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-yellow px-4 py-2.5 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconCheck className="h-4 w-4" />
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
