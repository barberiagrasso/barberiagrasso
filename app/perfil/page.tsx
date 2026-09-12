import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { CerrarSesionButton } from "@/components/brand/CerrarSesionButton";

export const dynamic = "force-dynamic";

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_presentada: "No presentada",
};

function colorEstado(estado: string): string {
  switch (estado) {
    case "completada":
      return "text-emerald-400";
    case "cancelada":
    case "no_presentada":
      return "text-red-400";
    default:
      return "text-brand-yellow";
  }
}

interface CitaHistorial {
  id: string;
  inicio: string;
  estado: string;
  sede: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  extras: { precio_centimos: number; servicio: { nombre: string } | { nombre: string }[] | null }[] | null;
}

// Supabase devuelve las relaciones "a uno" como objeto normalmente, pero
// TypeScript las tipa como posible array según la versión del cliente —
// esta ayuda se queda con el primer elemento si acaso.
function uno<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor;
}

export default async function PerfilPage() {
  const { cliente } = await requireCliente();

  // Se usa el cliente de servicio para traer el historial completo (con
  // nombres de servicios/profesionales aunque alguno se haya desactivado
  // después) — el acceso ya está comprobado arriba por requireCliente(),
  // y aquí solo se piden citas de ESE cliente, nunca de otro.
  const admin = createAdminClient();
  const { data: citas } = await admin
    .from("citas")
    .select(
      "id, inicio, estado, sede:sedes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
    )
    .eq("cliente_id", cliente.id)
    .order("inicio", { ascending: false });

  const historial = (citas ?? []) as unknown as CitaHistorial[];

  return (
    <main className="min-h-screen bg-brand-black px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-48 text-brand-white sm:w-56" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">Mi perfil</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-brand-white-dim">
            {cliente.nombre} · {cliente.telefono}
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            ← Volver
          </Link>
          <CerrarSesionButton className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow" />
        </div>

        <h2 className="mb-3 font-heading text-lg text-brand-white">Historial de citas</h2>

        {historial.length === 0 && (
          <p className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-4 font-body text-sm text-brand-white-dim">
            Todavía no tienes citas con nosotros.
          </p>
        )}

        <div className="space-y-3">
          {historial.map((cita) => {
            const sede = uno(cita.sede);
            const servicio = uno(cita.servicio);
            const profesional = uno(cita.profesional);
            const extras = cita.extras ?? [];
            const total = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);

            return (
              <div key={cita.id} className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-base text-brand-white">{servicio?.nombre ?? "Servicio"}</p>
                    <p className="mt-0.5 font-body text-sm text-brand-white-dim">
                      {new Date(cita.inicio).toLocaleString("es-ES", {
                        dateStyle: "full",
                        timeStyle: "short",
                        timeZone: "Europe/Madrid",
                      })}
                    </p>
                    <p className="mt-0.5 font-mono text-xs uppercase tracking-wider text-brand-white-dim">
                      {sede?.nombre} · {profesional?.nombre ?? "Cualquiera"}
                    </p>
                    {extras.length > 0 && (
                      <p className="mt-1 font-body text-xs text-brand-white-dim">
                        + {extras.map((e) => uno(e.servicio)?.nombre).filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={"font-mono text-xs uppercase tracking-wider " + colorEstado(cita.estado)}>
                      {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                    </p>
                    <p className="mt-1 font-mono text-base tabular-nums text-brand-white">
                      {formatearPrecio(total)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
