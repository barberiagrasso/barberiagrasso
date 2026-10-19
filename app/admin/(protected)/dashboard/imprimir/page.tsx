import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarDatosAgenda } from "@/lib/agenda";
import { horaEnMadrid } from "@/lib/horarioLocal";
import BotonImprimir from "./BotonImprimir";

export const dynamic = "force-dynamic";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  no_presentada: "No presentada",
};

interface ServicioAnidado {
  nombre: string;
}
interface ExtraCita {
  servicio: ServicioAnidado | ServicioAnidado[] | null;
}

// "servicio" puede llegar como objeto suelto o como array de un elemento
// según cómo Supabase resuelva la relación anidada — mismo criterio que
// nombresExtras() en AgendaClient.tsx.
function nombresExtras(extras: ExtraCita[] | undefined): string {
  return (extras ?? [])
    .map((ex) => (Array.isArray(ex.servicio) ? ex.servicio[0] : ex.servicio))
    .map((s) => s?.nombre)
    .filter((n): n is string => Boolean(n))
    .join(", ");
}

function fechaFormateada(fecha: string) {
  // Mediodía fijo para no arrastrar líos de huso horario al formatear
  // solo una fecha (sin hora) — mismo truco que en lib/agenda.ts.
  const texto = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Hoja del día lista para imprimir: pensada para que Diego (o un
 * barbero) la lleve en papel o la consulte sin depender del calendario
 * interactivo — ni arrastre, ni colores por profesional, solo la lista
 * de citas del día en orden, de un vistazo. Se abre desde el botón
 * "Imprimir" de la Agenda (ver AgendaClient.tsx), que ya manda la sede y
 * la fecha que se estaban mirando; abierta sin esos parámetros, cae en
 * la primera sede y el día de hoy.
 *
 * Reutiliza cargarDatosAgenda(), la misma función que usa la Agenda
 * interactiva y su API — así nunca se puede desincronizar de lo que ve
 * el panel normal, y el enmascarado de teléfonos para un barbero (ver
 * lib/telefono.ts) se sigue aplicando igual aquí.
 */
export default async function ImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; fecha?: string }>;
}) {
  const { admin } = await requireAdmin();
  const { sede: sedeIdParam, fecha: fechaParam } = await searchParams;

  const supabase = createAdminClient();
  const { data: sedes } = await supabase.from("sedes").select("id, nombre").order("nombre");

  const fecha = fechaParam || hoyISO();
  const sedeId = sedeIdParam || sedes?.[0]?.id;
  const sede = sedes?.find((s) => s.id === sedeId);

  if (!sedeId || !sede) {
    return <p className="text-sm text-stone-500">No hay ninguna sede configurada todavía.</p>;
  }

  const datos = await cargarDatosAgenda(supabase, { sedeId, fecha, fechaFin: fecha, rolAdmin: admin.rol });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Hoja del día</h1>
          <p className="text-sm text-stone-500">
            Vista de solo lectura para imprimir o consultar sin el calendario interactivo.
          </p>
        </div>
        <BotonImprimir />
      </div>

      <div className="mb-4 border-b border-stone-300 pb-3">
        <div className="text-lg font-bold text-stone-900">Barbería Grasso — {sede.nombre}</div>
        <div className="text-sm text-stone-600">{fechaFormateada(fecha)}</div>
      </div>

      {datos.citas.length === 0 ? (
        <p className="text-sm text-stone-500">No hay ninguna cita ese día en esta sede.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-2">Hora</th>
              <th className="py-2 pr-2">Barbero</th>
              <th className="py-2 pr-2">Cliente</th>
              <th className="py-2 pr-2">Teléfono</th>
              <th className="py-2 pr-2">Servicio</th>
              <th className="py-2 pr-2">Estado</th>
              <th className="py-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {datos.citas.map((cita: any) => {
              const extras = nombresExtras(cita.extras);
              return (
                <tr key={cita.id} className="border-b border-stone-200 align-top">
                  <td className="whitespace-nowrap py-2 pr-2 font-medium text-stone-900">
                    {horaEnMadrid(cita.inicio)}–{horaEnMadrid(cita.fin)}
                  </td>
                  <td className="py-2 pr-2">{cita.profesional?.nombre ?? "—"}</td>
                  <td className="py-2 pr-2">{cita.cliente?.nombre ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-2">{cita.cliente?.telefono ?? "—"}</td>
                  <td className="py-2 pr-2">
                    {cita.servicio?.nombre ?? "—"}
                    {extras && <span className="text-stone-500"> + {extras}</span>}
                  </td>
                  <td className="py-2 pr-2">
                    <span className={cita.estado === "cancelada" ? "text-stone-400 line-through" : ""}>
                      {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                    </span>
                  </td>
                  <td className="py-2 text-stone-600">{cita.notas ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
