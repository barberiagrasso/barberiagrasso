import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import CampanasClient from "./CampanasClient";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  await requireRolAdmin();
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: plantillas }] = await Promise.all([
    supabase.from("sedes").select("id, nombre").order("nombre"),
    supabase.from("plantillas_whatsapp").select("id, nombre, activa").eq("tipo", "campana").order("created_at"),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Campañas comerciales</h1>
      <p className="mb-4 max-w-2xl text-sm text-stone-500">
        Crea un segmento de clientes (por sede, etiqueta, o quiénes llevan tiempo sin venir) y
        redacta un mensaje. Solo se incluye a quien haya dado su consentimiento comercial. Para
        poder enviarla de verdad hace falta WhatsApp Business conectado y una plantilla aprobada
        por Meta (ver /admin/plantillas) — mientras tanto puedes ir guardando campañas como
        borrador.
      </p>
      <CampanasClient sedes={sedes ?? []} plantillas={plantillas ?? []} />
    </div>
  );
}
