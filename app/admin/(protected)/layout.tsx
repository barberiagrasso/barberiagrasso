import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoMark } from "@/components/brand/GrassoMark";
import AdminNav from "./AdminNav";
import SignOutButton from "./SignOutButton";
import NuevaCitaRapida from "./NuevaCitaRapida";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();

  // Datos para el botón flotante de "nueva cita rápida", disponible en
  // todas las páginas del panel (no solo en la Agenda).
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre").order("nombre"),
    supabase.from("servicios").select("id, nombre, duracion_minutos, precio_centimos").order("nombre"),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-black/10 bg-brand-black">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <GrassoMark className="h-6 w-6 text-brand-yellow" />
              <span className="font-heading text-lg italic text-brand-white">Barbería Grasso</span>
            </div>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3 font-body text-sm text-brand-white-dim">
            <span>{admin.nombre || "Administrador"}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <NuevaCitaRapida sedes={sedes ?? []} servicios={servicios ?? []} />
    </div>
  );
}
