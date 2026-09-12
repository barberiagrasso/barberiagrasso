import { createPublicClient } from "@/lib/supabase/public";
import BookingFlow from "./BookingFlow";
import { GrassoLogo } from "@/components/brand/GrassoLogo";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  const supabase = createPublicClient();

  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, slug, direccion, telefono, activo").order("nombre"),
    supabase
      .from("servicios")
      .select("id, nombre, descripcion, duracion_minutos, precio_centimos, activo, categoria, orden")
      .order("orden"),
  ]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-black px-4 py-10 sm:py-14">
      {/* Fondo ambiental: una foto real de la barbería, muy oscurecida y
          difuminada. Es solo textura — fija, sin animación ni interacción —
          para no distraer ni un ápice del flujo de reserva. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url(/media/texturas/reservar-bg.jpg)" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-brand-black/70" />

      <div className="relative mx-auto max-w-xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-56 text-brand-white sm:w-64" />
          <p className="mt-4 font-heading text-lg italic text-brand-white-dim">
            Reserva tu cita
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-brand-white-dim">
            Los Molinos · Avenida de las Ciudades
          </p>
        </div>
        <BookingFlow sedes={sedes ?? []} servicios={servicios ?? []} />
      </div>
    </main>
  );
}
