import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import ProfesionalesClient from "./ProfesionalesClient";

export const dynamic = "force-dynamic";

export default async function ProfesionalesPage() {
  await requireRolAdmin();
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre").order("nombre"),
    supabase.from("servicios").select("id, nombre, categoria").eq("activo", true).order("nombre"),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Equipo</h1>
      <p className="mb-4 text-sm text-stone-500">
        Da de alta a un barbero, dile en qué sede(s) trabaja, qué servicios realiza y su horario
        semanal. Todo esto decide qué opciones ve el cliente al reservar.
      </p>
      <ProfesionalesClient sedes={sedes ?? []} servicios={servicios ?? []} />
    </div>
  );
}
