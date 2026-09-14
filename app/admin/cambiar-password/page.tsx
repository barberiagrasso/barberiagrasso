import { requireAdmin } from "@/lib/adminAuth";
import { rutaSiguienteSegura } from "@/lib/rutaSiguiente";
import { GrassoMark } from "@/components/brand/GrassoMark";
import CambiarPasswordForm from "./CambiarPasswordForm";

export const dynamic = "force-dynamic";

// Fuera del grupo (protected): requireAdmin() con saltarCambioObligatorio
// para no entrar en un bucle de redirecciones cuando justo es esta
// pantalla la que hay que ver antes que ninguna otra.
export default async function CambiarPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { admin } = await requireAdmin({ saltarCambioObligatorio: true });
  const { next } = await searchParams;
  const destino = rutaSiguienteSegura(next, "/admin/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoMark className="h-14 w-14 text-brand-yellow" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">
            {admin.debe_cambiar_password ? "Elige tu contraseña" : "Cambiar contraseña"}
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-white-dim">Barbería Grasso</p>
        </div>
        {admin.debe_cambiar_password && (
          <p className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-center font-body text-sm text-amber-200">
            Es tu primer acceso: antes de continuar, elige una contraseña nueva (no puede ser la
            que te dieron por defecto).
          </p>
        )}
        <CambiarPasswordForm obligatorio={admin.debe_cambiar_password} destino={destino} />
      </div>
    </main>
  );
}
