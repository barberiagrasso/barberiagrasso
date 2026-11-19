import { requireAdmin } from "@/lib/adminAuth";
import CajaClient from "./CajaClient";

export const dynamic = "force-dynamic";

// Apertura y cierre de caja diario por sede. Abrir: cualquiera del
// equipo de la sede. Cerrar: solo el encargado de caja (o el dueño).
export default async function CajaPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Caja</h1>
      <p className="mb-4 text-sm text-stone-500">
        Por la mañana se abre la caja contando el fondo. Por la noche el encargado la cierra: cuenta el efectivo, hace la
        foto del sobre y queda todo guardado.
      </p>
      <CajaClient />
    </div>
  );
}
