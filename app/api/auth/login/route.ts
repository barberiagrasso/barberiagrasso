import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailSinteticoParaTelefono, normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefonoBruto = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!telefonoBruto || !password) {
    return NextResponse.json({ error: "Introduce tu teléfono y tu contraseña." }, { status: 400 });
  }

  const telefono = normalizarTelefono(telefonoBruto);

  // Límite de intentos por teléfono (fuerza bruta dirigida a una
  // cuenta) y por IP (probar muchos teléfonos distintos desde el mismo
  // sitio) — el que salte primero corta el intento.
  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`login:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 15 }),
    comprobarLimite(`login:ip:${ipDePeticion(request)}`, { maxIntentos: 30, ventanaMinutos: 15 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailSinteticoParaTelefono(telefono),
    password,
  });

  if (error) {
    return NextResponse.json({ error: "Teléfono o contraseña incorrectos." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
