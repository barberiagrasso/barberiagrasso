import { NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleWalletConfigurado, generarEnlaceGoogleWallet } from "@/lib/wallet/googleWallet";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Genera el enlace "Añadir a Google Wallet" de la tarjeta de fidelización
// del cliente que ha iniciado sesión (nunca la de otro). Ver
// lib/wallet/googleWallet.ts para qué necesita Diego configurar para que
// esto deje de devolver 501.
export async function GET() {
  if (!googleWalletConfigurado()) {
    return NextResponse.json({ error: "Google Wallet todavía no está activado." }, { status: 501 });
  }

  let cliente;
  try {
    ({ cliente } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data: fila } = await supabase
    .from("clientes")
    .select("saldo_fidelizacion_centimos")
    .eq("id", cliente.id)
    .single();

  try {
    const url = generarEnlaceGoogleWallet({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      saldoFidelizacionCentimos: fila?.saldo_fidelizacion_centimos ?? 0,
    });
    return NextResponse.json({ url });
  } catch (err) {
    await registrarError({ origen: "fidelizacion", mensaje: "Fallo generando el enlace de Google Wallet", detalle: err });
    return NextResponse.json({ error: "No se pudo generar la tarjeta para Google Wallet." }, { status: 500 });
  }
}
