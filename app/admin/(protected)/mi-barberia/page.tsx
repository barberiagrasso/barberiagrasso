import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarBonoTipos } from "@/lib/bonos";
import MiBarberiaClient from "./MiBarberiaClient";
import { cargarFotosPortafolio, cargarResenasExternas } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

export default async function MiBarberiaPage() {
  const { admin } = await requireRolAdmin();
  const esAdmin = admin.rol === "admin";
  const supabase = createAdminClient();

  const [
    { data: servicios },
    { data: productos },
    { data: sedesEquipo },
    { data: serviciosEquipo },
    bonoTipos,
    { data: sedesConNormas },
    fotosPortafolio,
    resenasExternas,
  ] = await Promise.all([
      supabase.from("servicios").select("*").order("categoria", { nullsFirst: true }).order("orden"),
      supabase.from("productos").select("*").order("categoria", { nullsFirst: true }).order("orden"),
      // Las pestañas "Bonos", "Equipo" y "Sedes" (dentro de este mismo
      // componente) solo las ve rol "admin" — para un barbero no hace
      // falta pedir estos cuatro extra, así que se ahorran las consultas.
      esAdmin ? supabase.from("sedes").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
      esAdmin
        ? supabase.from("servicios").select("id, nombre, categoria").eq("activo", true).order("nombre")
        : Promise.resolve({ data: [] }),
      esAdmin ? listarBonoTipos(supabase) : Promise.resolve([]),
      esAdmin
        ? supabase
            .from("sedes")
            .select("id, nombre, acepta_tarjeta, acceso_movilidad_reducida, wifi, apto_ninos")
            .order("nombre")
        : Promise.resolve({ data: [] }),
      // Portafolio y notas de Booksy/Google: solo rol "admin" (pestañas
      // "Portafolio" y "Sedes"). Devuelven vacío si el script aún no se ejecutó.
      esAdmin ? cargarFotosPortafolio(supabase) : Promise.resolve([]),
      esAdmin ? cargarResenasExternas(supabase) : Promise.resolve({}),
    ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Mi barbería</h1>
      <p className="mb-4 text-sm text-stone-500">
        Servicios y precios, productos que se venden en persona{esAdmin ? ", los bonos y el equipo de barberos" : ""}:
        todo lo que define cómo funciona la barbería, agrupado en un mismo sitio.
      </p>
      <MiBarberiaClient
        servicios={servicios ?? []}
        productos={productos ?? []}
        bonoTipos={bonoTipos}
        esAdmin={esAdmin}
        sedesEquipo={sedesEquipo ?? []}
        serviciosEquipo={serviciosEquipo ?? []}
        sedesConNormas={sedesConNormas ?? []}
        fotosPortafolio={fotosPortafolio}
        resenasExternas={resenasExternas}
      />
    </div>
  );
}
