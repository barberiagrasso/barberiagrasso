import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { codigoRecuperacionCoincide, MAX_INTENTOS_CODIGO } from "@/lib/recuperacionPassword";
import { ponerCookieSesion } from "@/lib/sesionCliente";

export const dynamic = "force-dynamic";

const ERROR_CODIGO = { error: "Código incorrecto o caducado. Pide uno nuevo." };

// Comprueba el código de WhatsApp y, si es bueno, deja al cliente
// reconocido en este navegador (cookie de 1 año, lib/sesionCliente.ts).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const telefono = normalizarTelefono(typeof body?.telefono === "string" ? body.telefono : "");
  const codigo = typeof body?.codigo === "string" ? body.codigo.replace(/\D/g, "") : "";
  if (!codigo) return NextResponse.json({ error: "Escribe el código." }, { status: 400 });

  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`codigo-confirmar:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 15 }),
    comprobarLimite(`codigo-confirmar:ip:${ipDePeticion(request)}`, { maxIntentos: 30, ventanaMinutos: 15 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });

  const admin = createAdminClient();
  const { data: cliente } = await admin.from("clientes").select("id").eq("telefono", telefono).maybeSingle();
  if (!cliente) return NextResponse.json(ERROR_CODIGO, { status: 401 });

  const { data: registro } = await admin
    .from("codigos_recuperacion")
    .select("id, codigo_hash, intentos, expira_at")
    .eq("cliente_id", cliente.id)
    .is("usado_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!registro || new Date(registro.expira_at) < new Date() || registro.intentos >= MAX_INTENTOS_CODIGO) {
    return NextResponse.json(ERROR_CODIGO, { status: 401 });
  }
  if (!codigoRecuperacionCoincide(codigo, registro.codigo_hash)) {
    await admin.from("codigos_recuperacion").update({ intentos: registro.intentos + 1 }).eq("id", registro.id);
    return NextResponse.json(ERROR_CODIGO, { status: 401 });
  }
  await admin.from("codigos_recuperacion").update({ usado_at: new Date().toISOString() }).eq("id", registro.id);

  const respuesta = NextResponse.json({ ok: true });
  ponerCookieSesion(respuesta, cliente.id);
  return respuesta;
}
