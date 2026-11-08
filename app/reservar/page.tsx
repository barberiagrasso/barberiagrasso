import { Suspense } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import BookingFlow from "./BookingFlow";
import { contarFotosPorServicio } from "@/lib/portafolio";
import InstalarApp from "@/components/pwa/InstalarApp";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import journeyStyles from "@/components/journey/journey.module.css";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  // Se puede reservar sin cuenta (01/11/2026). Si este móvil ya reconoce
  // al cliente, sus datos salen rellenos; si no, los escribe en el paso 5.
  // Nunca se rellena nada a partir de un teléfono escrito a mano.
  const cliente = (await obtenerClienteActual())?.cliente ?? null;

  const supabase = createPublicClient();

  const [
    { data: sedes },
    { data: servicios },
    { data: profesionalSedes },
    { data: profesionalServicios },
    fotosPorServicio,
  ] = await Promise.all([
    supabase
      .from("sedes")
      .select("id, nombre, slug, direccion, telefono, activo, acepta_tarjeta, acceso_movilidad_reducida, wifi, apto_ninos")
      .order("nombre"),
    supabase
      .from("servicios")
      .select(
        "id, nombre, descripcion, duracion_minutos, precio_centimos, activo, categoria, orden, precio_variable, coste_grassocoins",
      )
      .order("orden"),
    supabase
      .from("profesional_sedes")
      .select("profesional_id, sede_id, profesionales!inner(activo)")
      .eq("profesionales.activo", true),
    supabase.from("profesional_servicios").select("profesional_id, servicio_id"),
    // Para enseñar "Ver trabajos" solo en los servicios con fotos (vacío si
    // el portafolio todavía no está creado en la base de datos).
    contarFotosPorServicio(supabase),
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
    <div className={`${journeyStyles.journeyPage} ${journeyFontVars}`}>
      <JourneyHeader cliente={cliente ? { nombre: cliente.nombre } : null} />

      <main className="relative overflow-hidden" style={{ paddingTop: "clamp(120px, 18vw, 170px)", paddingBottom: "clamp(90px, 10vw, 140px)" }}>
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

        <div className="relative mx-auto max-w-xl px-4">
          <div className="mb-10 text-center">
            <p className={journeyStyles.eyebrow} style={{ textAlign: "center" }}>Reserva tu cita</p>
            <h1
              className="text-4xl uppercase leading-none tracking-tight text-brand-white sm:text-5xl"
              style={{ fontFamily: "var(--font-anton), Impact, 'Arial Narrow', sans-serif" }}
            >
              Elige y listo.
            </h1>
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
              fotosPorServicio={fotosPorServicio}
              clienteInicial={
                cliente
                  ? {
                      nombre: cliente.nombre,
                      telefono: cliente.telefono,
                      email: cliente.email,
                      grassocoins: cliente.grassocoins ?? 0,
                    }
                  : undefined
              }
            />
          </Suspense>
        </div>
      </main>

      <JourneyFooter />
    </div>
  );
}
