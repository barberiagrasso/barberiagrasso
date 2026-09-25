import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { cargarDatosAgenda } from "@/lib/agenda";
import AgendaClient from "./AgendaClient";

export const dynamic = "force-dynamic";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { admin } = await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, slug").order("nombre"),
    supabase.from("servicios").select("id, nombre, duracion_minutos, precio_centimos, categoria, color").order("nombre"),
  ]);

  // Se piden ya aquí, en el servidor, las citas del primer día que va a
  // pintar AgendaClient (hoy, la primera sede) — son justo los mismos
  // parámetros con los que arrancaría su primer fetch desde el
  // navegador. Así la Agenda no se ve vacía ("Cargando…") mientras
  // hidrata el JS del cliente: llega ya con datos. Si no hay ninguna
  // sede configurada, se deja vacío y AgendaClient no llega a pedir nada.
  const sedeInicialId = sedes?.[0]?.id;
  const fechaInicial = hoyISO();
  const datosIniciales = sedeInicialId
    ? await cargarDatosAgenda(supabase, { sedeId: sedeInicialId, fecha: fechaInicial, fechaFin: fechaInicial, rolAdmin: admin.rol })
    : null;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-stone-900">Agenda</h1>
      <AgendaClient
        sedes={sedes ?? []}
        servicios={servicios ?? []}
        esAdmin={admin.rol === "admin"}
        profesionalIdPropio={admin.profesional_id}
        datosIniciales={datosIniciales}
      />
    </div>
  );
}
