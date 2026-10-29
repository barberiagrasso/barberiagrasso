import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errorLog";
import { MESES_CADUCIDAD_GRASSOCOINS } from "@/lib/grassocoins";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Caducidad de las GrassoCoins (decisión de Diego, 27/10/2026): quien pasa
 * 6 meses sin venir pierde sus coins. Toda la lógica está en la función de
 * base de datos caducar_grassocoins_inactivos() (ver
 * supabase/anadir-grassocoins.sql); esto solo comprueba el secreto y la
 * llama. Lo dispara GitHub Actions una vez al día
 * (.github/workflows/caducidad-grassocoins.yml), con el mismo CRON_SECRET
 * que el resto de tareas programadas.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("caducar_grassocoins_inactivos", {
    p_meses: MESES_CADUCIDAD_GRASSOCOINS,
  });
  if (error) {
    await registrarError({ origen: "fidelizacion", mensaje: "Fallo al caducar GrassoCoins de clientes inactivos", detalle: error });
    return NextResponse.json({ ok: false, error: "No se pudieron caducar las GrassoCoins." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, clientesCaducados: data ?? 0 });
}
