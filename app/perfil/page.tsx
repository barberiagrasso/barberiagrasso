import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { EditarPerfilHeader } from "./EditarPerfilHeader";
import { HistorialCitas, type CitaNormalizada } from "./HistorialCitas";
import { BonosSection } from "./BonosSection";
import { precioCitaCentimos } from "@/lib/precios";
import { bonosDelCliente } from "@/lib/bonos";

export const dynamic = "force-dynamic";

interface CitaCruda {
  id: string;
  inicio: string;
  estado: string;
  precio_final_centimos: number | null;
  sede: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  profesional: { nombre: string; foto_url?: string | null } | { nombre: string; foto_url?: string | null }[] | null;
  extras: { precio_centimos: number; servicio: { nombre: string } | { nombre: string }[] | null }[] | null;
}

// Supabase devuelve las relaciones "a uno" como objeto normalmente, pero
// TypeScript las tipa como posible array según la versión del cliente —
// esta ayuda se queda con el primer elemento si acaso.
function uno<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor;
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default async function PerfilPage() {
  const { cliente } = await requireCliente();

  // Se usa el cliente de servicio para traer el historial completo (con
  // nombres de servicios/profesionales aunque alguno se haya desactivado
  // después) — el acceso ya está comprobado arriba por requireCliente(),
  // y aquí solo se piden citas de ESE cliente, nunca de otro.
  const admin = createAdminClient();
  const bonos = await bonosDelCliente(admin, cliente.id);
  const { data: citas } = await admin
    .from("citas")
    .select(
      "id, inicio, estado, precio_final_centimos, sede:sedes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre, foto_url), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
    )
    .eq("cliente_id", cliente.id)
    .order("inicio", { ascending: false });

  const historial: CitaNormalizada[] = ((citas ?? []) as unknown as CitaCruda[]).map((cita) => {
    const servicio = uno(cita.servicio);
    const extras = cita.extras ?? [];
    const totalAutomatico = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);
    const total = precioCitaCentimos(cita.precio_final_centimos, totalAutomatico);

    return {
      id: cita.id,
      inicio: cita.inicio,
      estado: cita.estado,
      sedeNombre: uno(cita.sede)?.nombre ?? null,
      servicioNombre: servicio?.nombre ?? "Servicio",
      precioTotalCentimos: total,
      profesionalNombre: uno(cita.profesional)?.nombre ?? "Cualquiera",
      profesionalFotoUrl: uno(cita.profesional)?.foto_url ?? null,
      extrasNombres: extras.map((e) => uno(e.servicio)?.nombre).filter((n): n is string => Boolean(n)),
    };
  });

  return (
    <main className="min-h-screen bg-brand-black px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-48 text-brand-white sm:w-56" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">Mi perfil</h1>
          {/* El nombre iba antes en mayúsculas forzadas con la misma
              tipografía que las etiquetas de sistema (p. ej. "TU SALDO DE
              FIDELIZACIÓN") — bien para una etiqueta, pero un nombre
              propio en mayúsculas de bloque se siente menos cercano.
              Ahora el nombre se muestra tal cual lo escribió el cliente,
              y el teléfono mantiene el tratamiento de etiqueta. */}
          <p className="mt-1 font-body text-base text-brand-white">{cliente.nombre}</p>
          <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-brand-white-dim">
            {cliente.telefono}
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            ← Volver
          </Link>
          <EditarPerfilHeader
            cliente={{
              nombre: cliente.nombre,
              telefono: cliente.telefono,
              email: cliente.email ?? null,
              fechaNacimiento: cliente.fecha_nacimiento ?? null,
            }}
          />
        </div>

        <Link
          href="/perfil/tarjeta"
          className="mb-6 flex items-center justify-between rounded-xl border border-brand-yellow/30 bg-brand-black-soft p-4 hover:border-brand-yellow/60"
        >
          <div>
            <p className="font-body text-xs uppercase tracking-widest text-brand-white-dim">Tu saldo de fidelización</p>
            <p className="mt-0.5 font-mono text-2xl text-brand-yellow">
              {formatearPrecio(cliente.saldo_fidelizacion_centimos ?? 0)}
            </p>
          </div>
          <span className="font-body text-sm text-brand-white-dim">Ver tarjeta →</span>
        </Link>

        <BonosSection bonos={bonos} />

        <h2 className="mb-3 font-heading text-lg text-brand-white">Historial de citas</h2>

        <HistorialCitas historialInicial={historial} />
      </div>
    </main>
  );
}
