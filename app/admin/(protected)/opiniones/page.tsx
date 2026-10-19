import { createAdminClient } from "@/lib/supabase/admin";
import OpinionesClient from "./OpinionesClient";

export const dynamic = "force-dynamic";

// Lista de valoraciones con estrellas que han dejado los clientes desde
// su perfil (ver app/api/resenas/route.ts) — comparación con las
// reseñas de Booksy, pedido de Diego 19/10/2026. Solo lectura: no hay
// forma de editar ni borrar una valoración desde aquí, igual que un
// cliente tampoco puede editar la suya una vez enviada.
export default async function OpinionesPage() {
  const supabase = createAdminClient();

  const { data: resenas } = await supabase
    .from("resenas")
    .select(
      "id, estrellas, comentario, created_at, cliente:clientes(nombre), profesional:profesionales(nombre), sede:sedes(nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Opiniones</h1>
      <p className="mb-4 text-sm text-stone-500">
        Valoraciones con estrellas que los clientes dejan desde su perfil tras una cita completada.
      </p>
      <OpinionesClient resenas={resenas ?? []} />
    </div>
  );
}
