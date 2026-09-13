import { NextRequest, NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Deja que un cliente actualice datos de su propia ficha que no afectan a
// la reserva en sí — de momento, solo su fecha de nacimiento (para el
// aviso automático de cumpleaños, ver lib/retencion.ts). Usa el cliente de
// servicio porque `clientes` solo tiene política de RLS de auto-lectura,
// no de auto-actualización — la comprobación de que es SU propia ficha ya
// la hace requireClienteApi().
export async function PATCH(request: NextRequest) {
  let cliente;
  try {
    ({ cliente } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body || !("fechaNacimiento" in body)) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  const fechaNacimiento = body.fechaNacimiento;
  if (fechaNacimiento !== null) {
    if (typeof fechaNacimiento !== "string" || !FECHA_REGEX.test(fechaNacimiento)) {
      return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
    }
    if (fechaNacimiento > new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: "La fecha no puede ser futura." }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("clientes").update({ fecha_nacimiento: fechaNacimiento }).eq("id", cliente.id);
  if (error) return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
