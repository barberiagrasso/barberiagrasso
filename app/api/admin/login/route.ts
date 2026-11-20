import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailSinteticoParaUsuarioEquipo } from "@/lib/usuarioEquipo";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Login del panel de administración, con el mismo límite de intentos
// que ya protege el login de clientes (ver app/api/auth/login/route.ts):
// antes esta pantalla llamaba a supabase.auth.signInWithPassword()
// directamente desde el navegador, sin pasar por comprobarLimite(), así
// que el panel de admin —el objetivo de mayor valor de toda la app,
// con datos de clientes y comisiones— tenía menos protección contra
// fuerza bruta que el propio formulario de reserva.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const usuarioBruto = typeof body?.usuario === "string" ? body.usuario.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!usuarioBruto || !password) {
    return NextResponse.json({ error: "Introduce tu usuario y tu contraseña." }, { status: 400 });
  }

  // Tu cuenta entra con tu email real; las cuentas de equipo (cada
  // barbero) entran con un usuario sencillo, sin @ — que aquí se
  // traduce al email sintético que espera Supabase Auth por debajo.
  const emailReal = usuarioBruto.includes("@")
    ? usuarioBruto
    : emailSinteticoParaUsuarioEquipo(usuarioBruto.toLowerCase());

  // Límite por cuenta (fuerza bruta dirigida a un admin concreto) y por
  // IP (probar muchas cuentas desde el mismo sitio) — el que salte
  // primero corta el intento.
  const [porCuenta, porIp] = await Promise.all([
    comprobarLimite(`admin-login:cuenta:${emailReal}`, { maxIntentos: 8, ventanaMinutos: 15 }),
    comprobarLimite(`admin-login:ip:${ipDePeticion(request)}`, { maxIntentos: 30, ventanaMinutos: 15 }),
  ]);
  if (!porCuenta.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: emailReal, password });

  if (error) {
    return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
