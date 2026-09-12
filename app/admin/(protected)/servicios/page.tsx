import { createAdminClient } from "@/lib/supabase/admin";
import ServiciosClient from "./ServiciosClient";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const supabase = createAdminClient();
  const { data: servicios } = await supabase
    .from("servicios")
    .select("*")
    .order("categoria", { nullsFirst: true })
    .order("orden");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Servicios y precios</h1>
      <p className="mb-4 text-sm text-stone-500">
        Edita aquí el catálogo que ven los clientes al reservar: precios, duración, y en qué
        desplegable aparece cada servicio (o si es uno de los 4 principales). Los cambios se ven
        al momento en la web, sin tocar Supabase ni volver a desplegar nada.
      </p>
      <ServiciosClient servicios={servicios ?? []} />
    </div>
  );
}
