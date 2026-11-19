import { requireAdmin } from "@/lib/adminAuth";
import PersonalClient from "./PersonalClient";

export const dynamic = "force-dynamic";

// Ficha de cada barbero para la reunión de pago. El dueño ve y edita a
// todo el equipo; un barbero solo ve la suya.
export default async function PersonalPage() {
  const { admin } = await requireAdmin();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">{admin.rol === "admin" ? "Personal" : "Mi ficha"}</h1>
      <p className="mb-4 text-sm text-stone-500">
        Facturación, comisión, sueldo, meta y opiniones de cada mes. Sirve para repasar cómo va el mes y para el pago.
      </p>
      <PersonalClient esAdmin={admin.rol === "admin"} />
    </div>
  );
}
