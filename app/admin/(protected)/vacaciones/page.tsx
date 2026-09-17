import { requireAdmin } from "@/lib/adminAuth";
import VacacionesClient from "./VacacionesClient";

export const dynamic = "force-dynamic";

export default async function VacacionesPage() {
  const { admin } = await requireAdmin();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Vacaciones</h1>
      <p className="mb-4 text-sm text-stone-500">
        {admin.rol === "admin"
          ? "Calendario de vacaciones de todo el equipo: aprueba o rechaza lo que te pidan, bloquea fechas si hace falta, y filtra por barbero."
          : "Pide tus vacaciones aquí — quedan pendientes hasta que el admin las apruebe. No puedes solicitar días que ya tenga otro barbero, ni los que el admin haya bloqueado."}
      </p>
      <VacacionesClient rol={admin.rol} profesionalIdPropio={admin.profesional_id} nombrePropio={admin.nombre} />
    </div>
  );
}
