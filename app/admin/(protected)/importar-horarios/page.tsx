import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HORARIOS_BOOKSY, emparejarBarbero, emparejarSede } from "@/lib/horariosBooksy";
import ImportarHorariosClient from "./ImportarHorariosClient";

export const dynamic = "force-dynamic";

// Pasar a la app los horarios de Booksy de todo el equipo. Solo el dueño,
// y no cambia nada hasta que pulsa "Guardar horarios".
export default async function ImportarHorariosPage() {
  await requireRolAdmin();
  const supabase = createAdminClient();
  const [{ data: profesionales }, { data: sedes }] = await Promise.all([
    supabase.from("profesionales").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("sedes").select("id, nombre").order("nombre"),
  ]);

  const filas = HORARIOS_BOOKSY.map((h) => ({
    ...h,
    sedeNombre: (sedes ?? []).find((s) => s.id === emparejarSede(h.sede, sedes ?? []))?.nombre ?? null,
    profesionalId: emparejarBarbero(h.nombre, profesionales ?? []),
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Horarios de Booksy</h1>
      <p className="mb-4 text-sm text-stone-500">
        Estos son los horarios que mandaste de Booksy. Comprueba que cada uno está con el barbero correcto y pulsa
        &quot;Guardar horarios&quot;: sustituye el horario de ese barbero en esa sede. Las citas ya reservadas no se tocan.
      </p>
      <ImportarHorariosClient filas={filas} profesionales={profesionales ?? []} />
    </div>
  );
}
