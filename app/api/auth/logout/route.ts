import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarCookieSesion } from "@/lib/sesionCliente";

export const dynamic = "force-dynamic";

// Cierra las dos sesiones posibles del cliente: la de invitado (cookie) y
// la antigua con contraseña (Supabase Auth).
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const respuesta = NextResponse.json({ ok: true });
  borrarCookieSesion(respuesta);
  return respuesta;
}
