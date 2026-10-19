"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cierra la sesión sola tras un rato sin actividad — pedido de Diego
// (19/10/2026, revisión de paneles): en un móvil o tablet compartido del
// local, la sesión de admin se quedaba abierta indefinidamente. 30
// minutos da margen de sobra para un rato sin tocar el panel mientras se
// atiende a un cliente, sin dejarla abierta todo el día.
const MINUTOS_INACTIVIDAD = 30;
const EVENTOS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export default function InactividadAutoLogout() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reiniciar() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/admin/login?error=inactividad");
        router.refresh();
      }, MINUTOS_INACTIVIDAD * 60 * 1000);
    }

    reiniciar();
    for (const evento of EVENTOS) {
      window.addEventListener(evento, reiniciar, { passive: true });
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      for (const evento of EVENTOS) {
        window.removeEventListener(evento, reiniciar);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
