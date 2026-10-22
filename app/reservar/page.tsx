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

  const [
    { data: sedes },
    { data: servicios },
    { data: profesionalSedes },
    { data: profesionalServicios },
  ] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, nombre, slug, direccion, telefono, activo, acepta_tarjeta, acceso_movilidad_reducida, wifi, apto_ninos")
      .order("nombre"),
    supabase
      .from("servicios")
      .select(
        "id, nombre, descripcion, duracion_minutos, precio_centimos, activo, categoria, orden, precio_variable",
      )
      .order("orden"),
    supabase
      .from("profesional_sedes")
      .select("profesional_id, sede_id, profesionales!inner(activo)")
      .eq("profesionales.activo", true),
    supabase.from("profesional_servicios").select("profesional_id, servicio_id"),
  ]);

  // Qué servicios tienen al menos un barbero activo en cada sede. Un
  // servicio dado de alta sin ningún barbero asignado no se puede
  // reservar (el calendario sale entero en gris y no aparece ningún
  // barbero), así que no se le enseña al cliente en esa sede. Si estas
  // consultas fallan, se pasa null y se muestran todos, como antes.
  let serviciosReservablesPorSede: Record<string, string[]> | null = null;
  if (profesionalSedes && profesionalServicios) {
    const serviciosPorProfesional = new Map<string, string[]>();
    for (const fila of profesionalServicios) {
      const lista = serviciosPorProfesional.get(fila.profesional_id) ?? [];
      lista.push(fila.servicio_id);
      serviciosPorProfesional.set(fila.profesional_id, lista);
    }
    const porSede = new Map<string, Set<string>>();
    for (const fila of profesionalSedes) {
      const conjunto = porSede.get(fila.sede_id) ?? new Set<string>();
      for (const servicioId of serviciosPorProfesional.get(fila.profesional_id) ?? []) {
        conjunto.add(servicioId);
      }
      porSede.set(fila.sede_id, conjunto);
    }
    serviciosReservablesPorSede = Object.fromEntries(
      [...porSede].map(([sedeId, ids]) => [sedeId, [...ids]]),
    );
  }

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
            serviciosReservablesPorSede={serviciosReservablesPorSede}
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
