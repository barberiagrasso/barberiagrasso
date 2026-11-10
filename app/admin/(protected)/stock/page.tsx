import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { esEncargadoDeStock } from "@/lib/stockAcceso";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";

// Stock de productos por sede. La ve el dueño (todas las sedes) y el
// barbero encargado de stock de cada sede (solo la suya).
export default async function StockPage() {
  const { admin } = await requireAdmin();
  if (admin.rol !== "admin" && !(await esEncargadoDeStock(admin.id))) redirect("/admin/dashboard");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Stock</h1>
      <p className="mb-4 text-sm text-stone-500">
        Cuántos productos hay en cada barbería, qué falta y cuánto pedir. Las ventas del cobro se descuentan solas; el
        encargado apunta lo que llega y hace recuentos.
      </p>
      <StockClient />
    </div>
  );
}
