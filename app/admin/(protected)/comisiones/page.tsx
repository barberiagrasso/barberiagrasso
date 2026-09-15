import { requireAdmin } from "@/lib/adminAuth";
import ComisionesClient from "./ComisionesClient";

export const dynamic = "force-dynamic";

// A diferencia de /admin/informes (solo rol "admin"), esta pantalla la
// puede abrir cualquier cuenta del panel: un barbero solo ve su propia
// comisión (filtrado en el servidor, ver /api/admin/comisiones), y un
// admin ve a todo el equipo además de poder editar los tramos.
export default async function ComisionesPage() {
  const { admin } = await requireAdmin();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">{admin.rol === "admin" ? "Comisiones" : "Tu comisión"}</h1>
      <p className="mb-4 text-sm text-stone-500">
        {admin.rol === "admin"
          ? "Facturación y comisión de cada barbero, mes a mes, y los tramos que las calculan."
          : "Tu facturación y comisión de cada mes, calculadas según los tramos vigentes."}
      </p>
      <ComisionesClient rol={admin.rol} />
    </div>
  );
}
