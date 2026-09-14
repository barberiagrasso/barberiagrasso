import { NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appleWalletConfigurado, generarPaseApple } from "@/lib/wallet/appleWallet";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Genera y sirve el .pkpass de la tarjeta de fidelización del cliente
// que ha iniciado sesión (nunca la de otro). Ver lib/wallet/appleWallet.ts
// para qué necesita Diego configurar para que esto deje de devolver 501.
export async function GET() {
  if (!appleWalletConfigurado()) {
    return NextResponse.json({ error: "Apple Wallet todavía no está activado." }, { status: 501 });
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
    const pkpass = await generarPaseApple({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      saldoFidelizacionCentimos: fila?.saldo_fidelizacion_centimos ?? 0,
    });
    return new NextResponse(new Uint8Array(pkpass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": "attachment; filename=tarjeta-barberia-grasso.pkpass",
      },
    });
  } catch (err) {
    await registrarError({ origen: "fidelizacion", mensaje: "Fallo generando el pase de Apple Wallet", detalle: err });
    return NextResponse.json({ error: "No se pudo generar la tarjeta para Apple Wallet." }, { status: 500 });
  }
}
