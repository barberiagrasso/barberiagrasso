import { Suspense } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { requireCliente } from "@/lib/clienteAuth";
import BookingFlow from "./BookingFlow";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import InstalarApp from "@/components/pwa/InstalarApp";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  // Igual que la portada: sin sesión de cliente, no se llega aquí.
  const { cliente } = await requireCliente();

  const supabase = createPublicClient();

  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, nombre, slug, direccion, telefono, activo")
      .order("nombre"),
    supabase
      .from("servicios")
      .select(
        "id, nombre, descripcion, duracion_minutos, precio_centimos, activo, categoria, orden, precio_variable",
      )
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-brand-black/70"
      />

      <div className="relative mx-auto max-w-xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-28 text-brand-white sm:w-32" />
          <p className="mt-4 font-heading text-lg italic text-brand-white-dim">
            Reserva tu cita
          </p>
        </div>
        <InstalarApp />
        {/* BookingFlow usa useSearchParams (para recoger la propuesta que
            venga del buscador de la portada, ver AsistenteReservaInicio) —
            Next.js exige envolverlo en Suspense por eso. */}
        <Suspense fallback={null}>
          <BookingFlow
            sedes={sedes ?? []}
            servicios={servicios ?? []}
            clienteInicial={{
              nombre: cliente.nombre,
              telefono: cliente.telefono,
              email: cliente.email,
              saldoFidelizacionCentimos: cliente.saldo_fidelizacion_centimos ?? 0,
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
