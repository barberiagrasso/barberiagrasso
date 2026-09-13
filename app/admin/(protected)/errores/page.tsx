import { createAdminClient } from "@/lib/supabase/admin";
import ErroresClient from "./ErroresClient";

export const dynamic = "force-dynamic";

export default async function ErroresPage() {
  const supabase = createAdminClient();

  const [{ data: sinResolver }, { data: resueltosRecientes }] = await Promise.all([
    supabase
      .from("errores_sistema")
      .select("id, origen, mensaje, detalle, created_at")
      .eq("resuelto", false)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("errores_sistema")
      .select("id, origen, mensaje, detalle, created_at, resuelto_at")
      .eq("resuelto", true)
      .order("resuelto_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Errores del sistema</h1>
      <p className="mb-4 text-sm text-stone-500">
        Fallos que han ocurrido creando o cancelando reservas, procesando WhatsApp, o en las tareas programadas
        (recordatorios y campañas de retención). Para fallos concretos del asistente de IA por WhatsApp, mira la
        sección de conversaciones.
      </p>
      <ErroresClient sinResolver={sinResolver ?? []} resueltosRecientes={resueltosRecientes ?? []} />
    </div>
  );
}
