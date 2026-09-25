import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { EditarPerfilHeader } from "./EditarPerfilHeader";
import { HistorialCitas, type CitaNormalizada } from "./HistorialCitas";
import { BonosSection } from "./BonosSection";
import { precioCitaCentimos } from "@/lib/precios";
import { bonosDelCliente } from "@/lib/bonos";
import { construirRecibo } from "@/lib/recibo";

export const dynamic = "force-dynamic";

// Incluye tanto lo que ya usaba esta pantalla (nombre de servicio/sede/
// profesional, precio) como lo que hace falta para poder construir el
// recibo de una visita completada con construirRecibo() (ver
// lib/recibo.ts): pagado_at, método de pago, descuento aplicado y si se
// anuló — todo en una sola consulta, sin repetirla por cada cita.
interface CitaCruda {
  id: string;
  inicio: string;
  estado: string;
  pagado_at: string | null;
  metodo_pago: string | null;
  precio_final_centimos: number | null;
  saldo_canjeado_centimos: number;
  descuento_porcentaje: number | null;
  descuento_motivo: string | null;
  recibo_anulado_at: string | null;
  recibo_anulado_por: string | null;
  recibo_anulado_motivo: string | null;
  sede: { nombre: string; direccion: string | null } | { nombre: string; direccion: string | null }[] | null;
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
  // Trae de una vez tanto lo que ya usaba esta pantalla (nombre de
  // servicio/sede/profesional, precio) como lo que hace falta para poder
  // construir el recibo de una visita completada (ver lib/recibo.ts):
  // pagado_at, método de pago, descuento aplicado y si se anuló.
  const { data: citas } = await admin
    .from("citas")
    .select(
      "id, inicio, estado, pagado_at, metodo_pago, precio_final_centimos, saldo_canjeado_centimos, descuento_porcentaje, descuento_motivo, recibo_anulado_at, recibo_anulado_por, recibo_anulado_motivo, sede:sedes(nombre, direccion), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre, foto_url), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
    )
    .eq("cliente_id", cliente.id)
    .order("inicio", { ascending: false });

  const citasCrudas = (citas ?? []) as unknown as CitaCruda[];

  // El recibo completo (ver lib/recibo.ts) solo tiene sentido para citas
  // ya "completada" — se cargan sus complementos/productos/reparto de
  // pago EN BLOQUE (no cita por cita) para no lanzar un montón de
  // consultas repetidas por cada visita del historial.
  const idsCompletadas = citasCrudas.filter((c) => c.estado === "completada").map((c) => c.id);
  const idsSeguro = idsCompletadas.length ? idsCompletadas : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: productosCrudos }, { data: pagosCrudos }] = await Promise.all([
    admin.from("cita_productos").select("cita_id, cantidad, precio_centimos, producto:productos(nombre)").in("cita_id", idsSeguro),
    admin.from("cita_pagos").select("cita_id, metodo, importe_centimos").in("cita_id", idsSeguro),
  ]);
  const productosPorCita = new Map<string, typeof productosCrudos>();
  for (const p of productosCrudos ?? []) {
    if (!productosPorCita.has(p.cita_id)) productosPorCita.set(p.cita_id, []);
    productosPorCita.get(p.cita_id)!.push(p);
  }
  const pagosPorCita = new Map<string, typeof pagosCrudos>();
  for (const p of pagosCrudos ?? []) {
    if (!pagosPorCita.has(p.cita_id)) pagosPorCita.set(p.cita_id, []);
    pagosPorCita.get(p.cita_id)!.push(p);
  }

  const historial: CitaNormalizada[] = citasCrudas.map((cita) => {
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
      // El propio cliente ve su recibo sin necesidad de otra consulta:
      // ya se sabe quién es (requireCliente() de arriba), así que se le
      // añade aquí a mano en vez de volver a pedirlo a la base de datos.
      recibo:
        cita.estado === "completada"
          ? construirRecibo({
              cita: { ...cita, cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono } },
              extras: extras as unknown as Parameters<typeof construirRecibo>[0]["extras"],
              productos: (productosPorCita.get(cita.id) ?? []) as unknown as Parameters<typeof construirRecibo>[0]["productos"],
              pagos: (pagosPorCita.get(cita.id) ?? []) as unknown as Parameters<typeof construirRecibo>[0]["pagos"],
            })
          : null,
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
