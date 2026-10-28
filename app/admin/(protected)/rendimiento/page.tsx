import { requireRolAdmin } from "@/lib/adminAuth";
import RendimientoClient from "./RendimientoClient";

export const dynamic = "force-dynamic";

// GRASSO PERFORMANCE IA — de momento, solo para el dueño. Solo lectura:
// analiza y simula, pero nunca cambia horarios.
export default async function RendimientoPage() {
  await requireRolAdmin();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Rendimiento</h1>
      <p className="mb-4 text-sm text-stone-500">
        Ocupación, productividad por hora y horarios más rentables de cada barbero, con un simulador para comparar
        horarios. Nada de esta pantalla cambia los horarios reales.
      </p>
      <a href="/admin/importar-horarios" className="mb-4 inline-block text-sm text-stone-700 underline">
        Pasar a la app los horarios de Booksy →
      </a>
      <RendimientoClient />
    </div>
  );
}
