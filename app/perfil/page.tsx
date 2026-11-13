import type { Metadata } from "next";
import { requireCliente } from "@/lib/clienteAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EditarPerfilHeader } from "./EditarPerfilHeader";
import { HistorialCitas, type CitaNormalizada } from "./HistorialCitas";
import { BonosSection } from "./BonosSection";
import { precioCitaCentimos } from "@/lib/precios";
import { bonosDelCliente } from "@/lib/bonos";
import { cargarResenasExternas } from "@/lib/portafolio";
import { fechaCaducidadGrassoCoins } from "@/lib/fidelizacion";
import { construirRecibo } from "@/lib/recibo";
import { minutosAgendaExtras } from "@/lib/duracionExtras";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import journeyStyles from "@/components/journey/journey.module.css";
import styles from "./perfil.module.css";

export const dynamic = "force-dynamic";

// Página privada (requiere sesión de cliente) con datos personales: sin
// openGraph (nada que compartir) y con noindex, para que Google no la
// indexe ni la muestre en resultados de búsqueda.
export const metadata: Metadata = {
  title: "Mi perfil · Barbería Grasso",
  robots: { index: false, follow: false },
};

// Incluye tanto lo que ya usaba esta pantalla (nombre de servicio/sede/
// profesional, precio) como lo que hace falta para poder construir el
// recibo de una visita completada con construirRecibo() (ver
// lib/recibo.ts): pagado_at, método de pago, descuento aplicado y si se
// anuló — todo en una sola consulta, sin repetirla por cada cita.
interface CitaCruda {
  id: string;
  inicio: string;
  estado: string;
  sede_id: string;
  servicio_id: string;
  profesional_id: string | null;
  profesional_elegido_por_cliente: boolean;
  pagado_at: string | null;
  metodo_pago: string | null;
  precio_final_centimos: number | null;
  saldo_canjeado_centimos: number;
  grassocoins_canjeados?: number | null;
  descuento_porcentaje: number | null;
  descuento_motivo: string | null;
  recibo_anulado_at: string | null;
  recibo_anulado_por: string | null;
  recibo_anulado_motivo: string | null;
  sede: { nombre: string; direccion: string | null } | { nombre: string; direccion: string | null }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  profesional: { nombre: string; foto_url?: string | null } | { nombre: string; foto_url?: string | null }[] | null;
  extras: { precio_centimos: number; duracion_minutos: number; servicio: { nombre: string } | { nombre: string }[] | null }[] | null;
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
  const [bonos, resenasExternas, { data: sedesContacto }, caducanCoins] = await Promise.all([
    bonosDelCliente(admin, cliente.id),
    cargarResenasExternas(admin),
    admin.from("sedes").select("id, telefono"),
    (cliente.grassocoins ?? 0) > 0 ? fechaCaducidadGrassoCoins(admin, cliente.id) : Promise.resolve(null),
  ]);
  // Tras valorar una visita se invita a TODOS a dejar la reseña también en
  // Google (enlace de su sede), y si la nota es baja se ofrece además
  // escribir a la barbería — ver SeccionValorar en HistorialCitas.tsx.
  const contactoResenasPorSede: Record<string, { googleEscribir: string | null; telefono: string | null }> = {};
  for (const sede of (sedesContacto ?? []) as { id: string; telefono: string | null }[]) {
    contactoResenasPorSede[sede.id] = {
      googleEscribir: resenasExternas[sede.id]?.google?.url_escribir ?? null,
      telefono: sede.telefono ?? null,
    };
  }
  // Trae de una vez tanto lo que ya usaba esta pantalla (nombre de
  // servicio/sede/profesional, precio) como lo que hace falta para poder
  // construir el recibo de una visita completada (ver lib/recibo.ts):
  // pagado_at, método de pago, descuento aplicado y si se anuló.
  const { data: citas } = await admin
    .from("citas")
    .select(
      "id, inicio, estado, sede_id, servicio_id, profesional_id, profesional_elegido_por_cliente, pagado_at, metodo_pago, precio_final_centimos, saldo_canjeado_centimos, grassocoins_canjeados, descuento_porcentaje, descuento_motivo, recibo_anulado_at, recibo_anulado_por, recibo_anulado_motivo, sede:sedes(nombre, direccion), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre, foto_url), extras:cita_extras(precio_centimos, duracion_minutos, servicio:servicios(nombre))"
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
    admin.from("cita_productos").select("cita_id, cantidad, precio_centimos, grassocoins_canjeados, producto:productos(nombre)").in("cita_id", idsSeguro),
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

  // Valoraciones ya enviadas por el cliente (ver lib/resenas.ts/
  // app/api/resenas/route.ts) — se traen en bloque para saber, cita por
  // cita, si hay que ofrecer "Valorar" o ya enseñar las estrellas
  // puestas. Solo tiene sentido pedirlas para citas completadas.
  const { data: resenasCrudas } = await admin
    .from("resenas")
    .select("cita_id, estrellas, comentario")
    .in("cita_id", idsSeguro);
  const resenaPorCita = new Map((resenasCrudas ?? []).map((r) => [r.cita_id, r]));

  const historial: CitaNormalizada[] = citasCrudas.map((cita) => {
    const servicio = uno(cita.servicio);
    const extras = cita.extras ?? [];
    const totalAutomatico = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);
    const total = precioCitaCentimos(cita.precio_final_centimos, totalAutomatico);

    return {
      id: cita.id,
      inicio: cita.inicio,
      estado: cita.estado,
      sedeId: cita.sede_id,
      servicioId: cita.servicio_id,
      profesionalId: cita.profesional_elegido_por_cliente ? cita.profesional_id : null,
      duracionExtraMinutos: minutosAgendaExtras(extras),
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
      resena: resenaPorCita.get(cita.id)
        ? {
            estrellas: resenaPorCita.get(cita.id)!.estrellas,
            comentario: resenaPorCita.get(cita.id)!.comentario,
          }
        : null,
    };
  });

  return (
    <div className={`${journeyStyles.journeyPage} ${journeyFontVars}`}>
      <JourneyHeader cliente={{ nombre: cliente.nombre }} />

      <main>
        <div className={journeyStyles.pageHead} style={{ textAlign: "center", paddingBottom: 0 }}>
          <p className={journeyStyles.eyebrow}>Mi perfil</p>
          <h1>{cliente.nombre}</h1>
        </div>

        <div className={styles.body}>
          <div className={styles.identity}>
            <p>{cliente.telefono}</p>
          </div>

          <div className={styles.toolbar}>
            <EditarPerfilHeader
              cliente={{
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                email: cliente.email ?? null,
                fechaNacimiento: cliente.fecha_nacimiento ?? null,
              }}
            />
          </div>

          <a href="/perfil/tarjeta" className={styles.coinsCard}>
            <div>
              <p className={styles.coinsLabel}>Tus GrassoCoins</p>
              <p className={styles.coinsValue}>{cliente.grassocoins ?? 0}</p>
              <p className={styles.coinsHint}>1 GrassoCoin por cada euro · canjéalas por servicios</p>
              {caducanCoins && (
                <p className={styles.coinsExpiry}>
                  Caducan el {caducanCoins.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })} si no vienes antes
                </p>
              )}
            </div>
            <span className={styles.coinsArrow}>Ver tarjeta →</span>
          </a>

          <BonosSection bonos={bonos} />

          <h2 className={styles.sectionTitle}>Historial de citas</h2>

          <HistorialCitas historialInicial={historial} contactoResenasPorSede={contactoResenasPorSede} />
        </div>
      </main>

      <JourneyFooter />
    </div>
  );
}
