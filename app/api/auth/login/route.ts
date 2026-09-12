import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailSinteticoParaTelefono, normalizarTelefono } from "@/lib/clientes";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefonoBruto = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!telefonoBruto || !password) {
    return NextResponse.json({ error: "Introduce tu teléfono y tu contraseña." }, { status: 400 });
  }

  const telefono = normalizarTelefono(telefonoBruto);
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
