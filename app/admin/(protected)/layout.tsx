import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoMark } from "@/components/brand/GrassoMark";
import AdminNav from "./AdminNav";
import SignOutButton from "./SignOutButton";
import NuevaCitaRapida from "./NuevaCitaRapida";

// Cuántos días hacia atrás se cuentan los fallos del asistente para el
// aviso — lo suficiente para no perder de vista uno del fin de semana sin
// arrastrar avisos antiguos indefinidamente.
const DIAS_FALLOS_ASISTENTE = 7;

// Envuelta en su propia función (en vez de llamar a Date.now() directamente
// en el cuerpo del componente) porque la regla react-hooks/purity no deja
// llamar a funciones impuras durante el render de un componente.
function fechaHaceNDiasISO(dias: number): string {
  return new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
}

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();

  // Datos para el botón flotante de "nueva cita rápida", disponible en
  // todas las páginas del panel (no solo en la Agenda), y para el aviso de
  // monitorización básica (conversaciones escaladas sin atender y fallos
  // recientes del asistente de IA) que se ve desde cualquier pantalla.
  const supabase = createAdminClient();
  const desde = fechaHaceNDiasISO(DIAS_FALLOS_ASISTENTE);
  const [
    { data: sedes },
    { data: servicios },
    { count: escaladasPendientes },
    { count: fallosRecientes },
    { count: erroresSinResolver },
  ] = await Promise.all([
    supabase.from("sedes").select("id, nombre").order("nombre"),
    supabase.from("servicios").select("id, nombre, duracion_minutos, precio_centimos").order("nombre"),
    supabase.from("conversaciones").select("id", { count: "exact", head: true }).eq("estado", "escalada"),
    supabase.from("fallos_asistente").select("id", { count: "exact", head: true }).gte("created_at", desde),
    supabase.from("errores_sistema").select("id", { count: "exact", head: true }).eq("resuelto", false),
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
      {((escaladasPendientes ?? 0) > 0 || (fallosRecientes ?? 0) > 0 || (erroresSinResolver ?? 0) > 0) && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 text-sm text-amber-900">
            {(escaladasPendientes ?? 0) > 0 && (
              <Link
                href="/admin/conversaciones"
                className="underline decoration-amber-500 underline-offset-2 hover:text-amber-950"
              >
                {escaladasPendientes} conversación{escaladasPendientes === 1 ? "" : "es"} de WhatsApp esperando tu
                respuesta
              </Link>
            )}
            {(fallosRecientes ?? 0) > 0 && (
              <Link
                href="/admin/conversaciones"
                className="underline decoration-amber-500 underline-offset-2 hover:text-amber-950"
              >
                {fallosRecientes} fallo{fallosRecientes === 1 ? "" : "s"} del asistente de IA en los últimos{" "}
                {DIAS_FALLOS_ASISTENTE} días
              </Link>
            )}
            {(erroresSinResolver ?? 0) > 0 && (
              <Link
                href="/admin/errores"
                className="underline decoration-amber-500 underline-offset-2 hover:text-amber-950"
              >
                {erroresSinResolver} error{erroresSinResolver === 1 ? "" : "es"} del sistema sin revisar
              </Link>
            )}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <NuevaCitaRapida sedes={sedes ?? []} servicios={servicios ?? []} />
    </div>
  );
}
