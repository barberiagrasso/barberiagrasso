"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CerrarSesionButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    setSaliendo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/acceso");
    router.refresh();
  }

  return (
    <button onClick={cerrarSesion} disabled={saliendo} className={className} title="Cerrar sesión" aria-label="Cerrar sesión">
      {children ?? (saliendo ? "Saliendo…" : "Cerrar sesión")}
    </button>
  );
}
