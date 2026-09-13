import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Límite sencillo de intentos, respaldado por la tabla
// `intentos_seguridad`. Objetivo: frenar fuerza bruta en el login,
// altas masivas de cuentas falsas y spam de reservas — sin depender de
// ningún servicio externo nuevo.
//
// No es (ni pretende ser) un rate-limiter de precisión para tráfico
// alto: para el volumen de una barbería es más que suficiente, y falla
// "abierto" (deja pasar la petición) si la comprobación en sí falla,
// para no bloquear el negocio por un problema de infraestructura.
// =====================================================================

export function ipDePeticion(request: NextRequest): string {
  // Vercel añade x-forwarded-for con la IP real del visitante delante.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "desconocida";
}

interface OpcionesLimite {
  /** Cuántos intentos como máximo se permiten dentro de la ventana. */
  maxIntentos: number;
  /** Tamaño de la ventana deslizante, en minutos. */
  ventanaMinutos: number;
}

/**
 * Comprueba si "clave" (p.ej. "login:tel:+34600000000" o "registro:ip:1.2.3.4")
 * ha superado el límite de intentos en la ventana indicada. Si no lo ha
 * superado, registra este intento y devuelve permitido:true. Pensada
 * para llamarse UNA vez por petición, justo antes de intentar la
 * acción real (no hace falta un segundo registro aparte).
 */
export async function comprobarLimite(clave: string, opciones: OpcionesLimite): Promise<{ permitido: boolean }> {
  try {
    const admin = createAdminClient();
    const desde = new Date(Date.now() - opciones.ventanaMinutos * 60_000).toISOString();

    const { count } = await admin
      .from("intentos_seguridad")
      .select("id", { count: "exact", head: true })
      .eq("clave", clave)
      .gte("creado_at", desde);

    if ((count ?? 0) >= opciones.maxIntentos) {
      return { permitido: false };
    }

    await admin.from("intentos_seguridad").insert({ clave });
    // Limpieza oportunista: al mismo tiempo, borra el rastro viejo de
    // ESTA clave (fuera de la ventana) para que la tabla no crezca sin
    // límite. Es barato porque ya estamos filtrando por esa clave.
    await admin.from("intentos_seguridad").delete().eq("clave", clave).lt("creado_at", desde);

    return { permitido: true };
  } catch (err) {
    // Si falla la propia comprobación (p.ej. Supabase caído un
    // instante), dejamos pasar la petición: un fallo aquí no debe
    // impedir reservar o iniciar sesión.
    console.warn(`[rateLimit] no se pudo comprobar el límite para "${clave}"`, err);
    return { permitido: true };
  }
}

export const RESPUESTA_DEMASIADOS_INTENTOS = {
  error: "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
};
