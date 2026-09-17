import { createAdminClient } from "@/lib/supabase/admin";
import ProductosClient from "./ProductosClient";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const supabase = createAdminClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("*")
    .order("categoria", { nullsFirst: true })
    .order("orden");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Productos</h1>
      <p className="mb-4 text-sm text-stone-500">
        Catálogo de productos que se venden solo en persona: no aparecen ni se pueden comprar
        desde la reserva online. Al cerrar una cita, el barbero puede añadir cualquiera de estos
        productos y su precio se suma al total — con su propia comisión, ver{" "}
        <a href="/admin/comisiones" className="underline">
          Comisiones
        </a>
        .
      </p>
      <ProductosClient productos={productos ?? []} />
    </div>
  );
}
