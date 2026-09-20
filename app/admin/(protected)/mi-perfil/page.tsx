import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiPerfilClient } from "./MiPerfilClient";

export const dynamic = "force-dynamic";

export default async function MiPerfilPage() {
  const { admin } = await requireAdmin();

  let fotoUrl: string | null = null;
  if (admin.profesional_id) {
    const supabase = createAdminClient();
    const { data } = await supabase.from("profesionales").select("foto_url").eq("id", admin.profesional_id).maybeSingle();
    fotoUrl = data?.foto_url ?? null;
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-1 text-xl font-bold text-stone-900">Mi perfil</h1>
      <p className="mb-4 text-sm text-stone-500">{admin.nombre}</p>

      {admin.profesional_id ? (
        <MiPerfilClient nombre={admin.nombre || "Barbero"} fotoInicial={fotoUrl} />
      ) : (
        <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
          Tu cuenta no tiene una ficha de barbero vinculada, así que no hay foto que gestionar aquí.
        </p>
      )}

      <Link
        href="/admin/cambiar-password?next=/admin/mi-perfil"
        className="mt-4 inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-400"
      >
        Cambiar contraseña
      </Link>
    </div>
  );
}
