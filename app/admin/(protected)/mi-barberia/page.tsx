import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import MiBarberiaClient from "./MiBarberiaClient";

export const dynamic = "force-dynamic";

export default async function MiBarberiaPage() {
  const { admin } = await requireAdmin();
  const esAdmin = admin.rol === "admin";
  const supabase = createAdminClient();

  const [{ data: servicios }, { data: productos }, { data: sedesEquipo }, { data: serviciosEquipo }] = await Promise.all([
    supabase.from("servicios").select("*").order("categoria", { nullsFirst: true }).order("orden"),
    supabase.from("productos").select("*").order("categoria", { nullsFirst: true }).order("orden"),
    // La pestaña "Equipo" (dentro de este mismo componente) solo la ve
    // rol "admin" — para un barbero no hace falta pedir estos dos
    // extra, así que se ahorran las dos consultas.
    esAdmin ? supabase.from("sedes").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
    esAdmin
      ? supabase.from("servicios").select("id, nombre, categoria").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Mi barbería</h1>
      <p className="mb-4 text-sm text-stone-500">
        Servicios y precios, productos que se venden en persona{esAdmin ? ", y el equipo de barberos" : ""}: todo lo
        que define cómo funciona la barbería, agrupado en un mismo sitio.
      </p>
      <MiBarberiaClient
        servicios={servicios ?? []}
        productos={productos ?? []}
        esAdmin={esAdmin}
        sedesEquipo={sedesEquipo ?? []}
        serviciosEquipo={serviciosEquipo ?? []}
      />
    </div>
  );
}
