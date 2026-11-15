import { requireAdmin } from "@/lib/adminAuth";
import AsesorPizarra from "./AsesorPizarra";

export const dynamic = "force-dynamic";

// Asesor de estilo para el equipo (tablet o móvil): foto del cliente,
// dibujar encima, guía de estilos, visagismo y probador con IA.
export default async function AsesorPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Asesor de estilo</h1>
      <p className="mb-4 text-sm text-stone-500">
        Haz una foto al cliente, dibuja encima con el dedo o el lápiz y elegid juntos el estilo. La foto no se guarda.
      </p>
      <AsesorPizarra />
    </div>
  );
}
