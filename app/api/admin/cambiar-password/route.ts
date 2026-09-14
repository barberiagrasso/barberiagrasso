import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// A propósito usa requireAdminApi() (no requireRolAdminApi()): cualquier
// cuenta del panel, admin o barbero, tiene que poder cambiar su propia
// contraseña — es justo lo que le pedimos hacer a una cuenta de equipo
// recién creada antes de dejarla ver nada más.
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const { user } = await requireAdminApi();
    userId = user.id;
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const passwordNueva = typeof body?.passwordNueva === "string" ? body.passwordNueva : "";
  if (passwordNueva.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: errorPassword } = await admin.auth.admin.updateUserById(userId, { password: passwordNueva });
  if (errorPassword) {
    return NextResponse.json({ error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." }, { status: 500 });
  }

  await admin.from("admins").update({ debe_cambiar_password: false }).eq("id", userId);

  return NextResponse.json({ ok: true });
}
