import { createPublicClient } from "@/lib/supabase/public";
import BookingFlow from "./BookingFlow";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  const supabase = createPublicClient();

  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, slug, direccion, telefono, activo").order("nombre"),
    supabase.from("servicios").select("id, nombre, descripcion, duracion_minutos, precio_centimos, activo").order("nombre"),
  ]);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">Reserva tu cita</h1>
      <p className="mt-1 text-stone-600">Barbería Grasso · Los Molinos y Avenida de las Ciudades</p>
      <div className="mt-6">
        <BookingFlow sedes={sedes ?? []} servicios={servicios ?? []} />
      </div>
    </main>
  );
}
