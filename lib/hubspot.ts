import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Sincronización con HubSpot (CRM externo de Diego)
// =====================================================================
// Este módulo NUNCA es el origen de la verdad: Supabase sigue siendo
// quien manda para reservar, comprobar huecos y todo lo operativo. Esto
// solo EMPUJA una copia de cada cliente (como Contacto) y cada cita
// (como Negocio) hacia HubSpot, para que Diego tenga un CRM de verdad
// donde consultar y segmentar, y una copia de seguridad de sus datos
// fuera de Supabase.
//
// Además de sincronizar registros sueltos, este módulo deja el propio
// HubSpot "montado" para el negocio: un pipeline de Negocios con las
// fases reales de una cita (no las de una venta genérica) y, en cada
// Contacto, datos ya calculados (nº de visitas, gasto total, última
// visita, servicio/profesional favorito y un segmento de cliente) para
// que Diego pueda crear Listas en HubSpot sin tener que calcular nada
// a mano.
//
// Diseño a prueba de fallos: si HubSpot no responde, está caído, o
// falta el token, NINGUNA de las funciones exportadas aquí lanza un
// error hacia quien la llama — como mucho registran un aviso en los
// logs. Una reserva, cancelación o alta de cliente nunca debe fallar
// por culpa de HubSpot.
//
// Requiere la variable de entorno HUBSPOT_ACCESS_TOKEN (token de una
// "Private App" creada en HubSpot, no el de este conector de Cowork).
// Sin ella, las funciones no hacen nada (ver estaConfigurado()).
// =====================================================================

const HUBSPOT_API = "https://api.hubapi.com";

function token(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN || null;
}

export function estaConfigurado(): boolean {
  return Boolean(token());
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

async function hubspotFetch(path: string, init: RequestInit): Promise<unknown> {
  const t = token();
  if (!t) throw new Error("HUBSPOT_ACCESS_TOKEN no configurado");

  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`HubSpot ${init.method ?? "GET"} ${path} → ${res.status}: ${cuerpo.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/** Convierte una fecha/hora ISO a lo que espera una propiedad "date" de
 * HubSpot: medianoche UTC del día correspondiente, en milisegundos. */
function fechaAHubspotDate(iso: string): string {
  const d = new Date(iso);
  return String(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---------------------------------------------------------------------
// Propiedades personalizadas: se crean solas la primera vez que hacen
// falta (una por servidor/arranque, en memoria) — Diego no tiene que
// tocar nada a mano en HubSpot.
// ---------------------------------------------------------------------

interface DefinicionPropiedad {
  name: string;
  label: string;
  type: "string" | "bool" | "enumeration" | "number" | "date";
  fieldType: "text" | "textarea" | "booleancheckbox" | "select" | "number" | "date";
  options?: { label: string; value: string }[];
}

const PROPIEDADES_CONTACTO: DefinicionPropiedad[] = [
  { name: "barberia_cliente_id", label: "ID cliente (app Barbería Grasso)", type: "string", fieldType: "text" },
  { name: "barberia_sede_habitual", label: "Sede habitual", type: "string", fieldType: "text" },
  {
    name: "barberia_acepta_comunicaciones",
    label: "Acepta comunicaciones comerciales",
    type: "bool",
    fieldType: "booleancheckbox",
    options: [
      { label: "Sí", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  { name: "barberia_notas", label: "Notas internas", type: "string", fieldType: "textarea" },
  { name: "barberia_cliente_desde", label: "Cliente desde", type: "string", fieldType: "text" },
  // --- Datos calculados para segmentar clientes (CRM/marketing) ---
  { name: "barberia_visitas_completadas", label: "Visitas completadas", type: "number", fieldType: "number" },
  { name: "barberia_gasto_total_eur", label: "Gasto total (€)", type: "number", fieldType: "number" },
  { name: "barberia_ultima_visita", label: "Última visita", type: "date", fieldType: "date" },
  { name: "barberia_servicio_favorito", label: "Servicio favorito", type: "string", fieldType: "text" },
  { name: "barberia_profesional_favorito", label: "Profesional favorito", type: "string", fieldType: "text" },
  {
    name: "barberia_segmento",
    label: "Segmento de cliente",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Nuevo (sin visitas completadas)", value: "nuevo" },
      { label: "Activo", value: "activo" },
      { label: "VIP", value: "vip" },
      { label: "Inactivo (+90 días sin venir)", value: "inactivo" },
    ],
  },
];

const PROPIEDADES_NEGOCIO: DefinicionPropiedad[] = [
  { name: "barberia_cita_id", label: "ID cita (app Barbería Grasso)", type: "string", fieldType: "text" },
  { name: "barberia_servicio", label: "Servicio", type: "string", fieldType: "text" },
  { name: "barberia_profesional", label: "Profesional", type: "string", fieldType: "text" },
  { name: "barberia_sede", label: "Sede", type: "string", fieldType: "text" },
  {
    name: "barberia_estado_cita",
    label: "Estado de la cita",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Confirmada", value: "confirmada" },
      { label: "Completada", value: "completada" },
      { label: "Cancelada", value: "cancelada" },
      { label: "No presentada", value: "no_presentada" },
    ],
  },
  {
    name: "barberia_origen",
    label: "Origen de la reserva",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "App", value: "app" },
      { label: "Panel (equipo)", value: "panel" },
      { label: "WhatsApp", value: "whatsapp" },
    ],
  },
  { name: "barberia_fecha_hora", label: "Fecha y hora de la cita", type: "string", fieldType: "text" },
];

async function asegurarPropiedad(objectType: "contacts" | "deals", def: DefinicionPropiedad) {
  try {
    await hubspotFetch(`/crm/v3/properties/${objectType}/${def.name}`, { method: "GET" });
    return; // ya existe
  } catch {
    // 404 esperado si no existe todavía — seguimos y la creamos.
  }
  try {
    await hubspotFetch(`/crm/v3/properties/${objectType}`, {
      method: "POST",
      body: JSON.stringify({
        name: def.name,
        label: def.label,
        groupName: objectType === "contacts" ? "contactinformation" : "dealinformation",
        type: def.type,
        fieldType: def.fieldType,
        options: def.options,
      }),
    });
  } catch (err) {
    // Puede fallar por una condición de carrera (otro proceso la acaba
    // de crear) — no es grave, se ignora.
    console.warn(`[hubspot] no se pudo asegurar la propiedad ${objectType}.${def.name}`, err);
  }
}

// ---------------------------------------------------------------------
// Pipeline de Negocios: en vez del embudo de ventas genérico que trae
// HubSpot por defecto, dejamos un pipeline con las 4 fases reales de
// una cita. Reaprovechamos los IDs de fase que ya trae toda cuenta
// nueva (en vez de borrarlos y crear otros) para no romper nada si ya
// hay Negocios en esas fases; solo les cambiamos la etiqueta.
// ---------------------------------------------------------------------

const STAGE_ID_CONFIRMADA = "appointmentscheduled";
const STAGE_ID_COMPLETADA = "closedwon";
const STAGE_ID_CANCELADA = "closedlost";
const STAGE_ID_NO_PRESENTADA = "barberia_no_presentada";

// Fases genéricas de venta que no usamos y que intentamos limpiar del
// pipeline (solo si no tienen ya Negocios asociados — si HubSpot
// rechaza el borrado, se dejan tal cual, no es grave).
const FASES_SOBRANTES = ["qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent"];

const FASES_DESEADAS: { id: string; label: string; isClosed: boolean; probability: string; displayOrder: number }[] = [
  { id: STAGE_ID_CONFIRMADA, label: "Confirmada", isClosed: false, probability: "0.5", displayOrder: 0 },
  { id: STAGE_ID_COMPLETADA, label: "Completada", isClosed: true, probability: "1.0", displayOrder: 10 },
  { id: STAGE_ID_CANCELADA, label: "Cancelada", isClosed: true, probability: "0.0", displayOrder: 11 },
  { id: STAGE_ID_NO_PRESENTADA, label: "No presentada", isClosed: true, probability: "0.0", displayOrder: 12 },
];

async function asegurarPipelineCitas(): Promise<void> {
  try {
    const pipelines = (await hubspotFetch(`/crm/v3/pipelines/deals`, { method: "GET" })) as {
      results: { id: string; stages: { id: string; label: string }[] }[];
    };
    const pipeline = pipelines?.results?.[0];
    if (!pipeline) return;

    const actuales = new Map(pipeline.stages.map((s) => [s.id, s]));

    for (const deseada of FASES_DESEADAS) {
      const actual = actuales.get(deseada.id);
      if (actual) {
        if (actual.label === deseada.label) continue; // ya está bien, no tocar
        await hubspotFetch(`/crm/v3/pipelines/deals/${pipeline.id}/stages/${deseada.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: deseada.label,
            displayOrder: deseada.displayOrder,
            metadata: { isClosed: String(deseada.isClosed), probability: deseada.probability },
          }),
        });
      } else {
        await hubspotFetch(`/crm/v3/pipelines/deals/${pipeline.id}/stages`, {
          method: "POST",
          body: JSON.stringify({
            id: deseada.id,
            label: deseada.label,
            displayOrder: deseada.displayOrder,
            metadata: { isClosed: String(deseada.isClosed), probability: deseada.probability },
          }),
        });
      }
    }

    for (const idSobrante of FASES_SOBRANTES) {
      if (!actuales.has(idSobrante)) continue;
      try {
        await hubspotFetch(`/crm/v3/pipelines/deals/${pipeline.id}/stages/${idSobrante}`, { method: "DELETE" });
      } catch {
        // Tiene Negocios asociados u otro motivo — se deja tal cual.
      }
    }
  } catch (err) {
    console.warn("[hubspot] no se pudo configurar el pipeline de citas", err);
  }
}

// ---------------------------------------------------------------------
// Arranque único (por instancia de servidor "caliente"): propiedades +
// pipeline. Diego no tiene que configurar nada a mano en HubSpot.
// ---------------------------------------------------------------------

let bootstrapListo: Promise<void> | null = null;

function asegurarBootstrap(): Promise<void> {
  if (!bootstrapListo) {
    bootstrapListo = (async () => {
      await Promise.all([
        ...PROPIEDADES_CONTACTO.map((p) => asegurarPropiedad("contacts", p)),
        ...PROPIEDADES_NEGOCIO.map((p) => asegurarPropiedad("deals", p)),
        asegurarPipelineCitas(),
      ]);
    })();
  }
  return bootstrapListo;
}

// ---------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------

function separarNombre(nombreCompleto: string): { firstname: string; lastname: string } {
  const partes = nombreCompleto.trim().split(/\s+/);
  return { firstname: partes[0] ?? "", lastname: partes.slice(1).join(" ") };
}

async function buscarContactoPorClienteId(clienteId: string): Promise<string | null> {
  const resultado = (await hubspotFetch(`/crm/v3/objects/contacts/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "barberia_cliente_id", operator: "EQ", value: clienteId }] }],
      limit: 1,
    }),
  })) as { results?: { id: string }[] };
  return resultado?.results?.[0]?.id ?? null;
}

export interface HistoricoFila {
  estado: string;
  inicio: string;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  extras: { precio_centimos: number }[] | null;
}

/** Umbrales de segmentación — ajustables si Diego quiere otro criterio. */
const UMBRAL_INACTIVO_DIAS = 90;
const UMBRAL_VIP_VISITAS = 6;
const UMBRAL_VIP_GASTO_EUR = 300;

export function calcularSegmento(visitasCompletadas: number, gastoTotalEur: number, ultimaVisitaISO: string | null) {
  if (visitasCompletadas === 0) return "nuevo";
  const diasDesdeUltimaVisita = ultimaVisitaISO ? (Date.now() - new Date(ultimaVisitaISO).getTime()) / 86400000 : Infinity;
  if (diasDesdeUltimaVisita > UMBRAL_INACTIVO_DIAS) return "inactivo";
  if (visitasCompletadas >= UMBRAL_VIP_VISITAS || gastoTotalEur >= UMBRAL_VIP_GASTO_EUR) return "vip";
  return "activo";
}

export function calcularEstadisticasCliente(historico: HistoricoFila[]) {
  const completadas = historico.filter((c) => c.estado === "completada");

  const gastoTotalCentimos = completadas.reduce((acc, c) => {
    const servicio = uno(c.servicio);
    const extras = c.extras ?? [];
    return acc + (servicio?.precio_centimos ?? 0) + extras.reduce((a, e) => a + e.precio_centimos, 0);
  }, 0);

  const ultimaVisitaISO = completadas[0]?.inicio ?? null; // historico viene ordenado por inicio desc

  const contarFavorito = (obtenerNombre: (c: HistoricoFila) => string | null | undefined) => {
    const conteo = new Map<string, number>();
    for (const c of completadas) {
      const nombre = obtenerNombre(c);
      if (!nombre) continue;
      conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
    }
    let mejor: string | null = null;
    let mejorConteo = 0;
    for (const [nombre, n] of conteo) {
      if (n > mejorConteo) {
        mejor = nombre;
        mejorConteo = n;
      }
    }
    return mejor ?? "";
  };

  const servicioFavorito = contarFavorito((c) => uno(c.servicio)?.nombre);
  const profesionalFavorito = contarFavorito((c) => uno(c.profesional)?.nombre);
  const gastoTotalEur = gastoTotalCentimos / 100;

  return {
    visitasCompletadas: completadas.length,
    gastoTotalEur,
    ultimaVisitaISO,
    servicioFavorito,
    profesionalFavorito,
    segmento: calcularSegmento(completadas.length, gastoTotalEur, ultimaVisitaISO),
  };
}

/**
 * Crea o actualiza el Contacto de HubSpot para ESTE cliente (releyendo su
 * estado actual en Supabase, incluido el consentimiento comercial y su
 * historial de citas para calcular visitas/gasto/segmento). Cachea el id
 * de HubSpot en clientes.hubspot_contact_id para no tener que volver a
 * buscarlo la próxima vez. Nunca lanza — si algo falla, se registra en
 * consola y se sigue sin más.
 */
export async function sincronizarClienteHubSpot(
  supabase: SupabaseClient,
  clienteId: string
): Promise<string | null> {
  if (!estaConfigurado()) return null;

  try {
    await asegurarBootstrap();

    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, email, notas, created_at, hubspot_contact_id, sede_habitual:sedes(nombre)")
      .eq("id", clienteId)
      .maybeSingle();
    if (!cliente) return null;

    const { data: consentimiento } = await supabase
      .from("consentimientos")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("tipo", "comercial")
      .eq("estado", "activo")
      .maybeSingle();

    const { data: historico } = await supabase
      .from("citas")
      .select("estado, inicio, servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre), extras:cita_extras(precio_centimos)")
      .eq("cliente_id", clienteId)
      .order("inicio", { ascending: false });

    const stats = calcularEstadisticasCliente((historico ?? []) as HistoricoFila[]);

    const sedeHabitual = uno(cliente.sede_habitual);
    const { firstname, lastname } = separarNombre(cliente.nombre);

    const propiedades: Record<string, string> = {
      firstname,
      lastname,
      phone: cliente.telefono,
      barberia_cliente_id: cliente.id,
      barberia_sede_habitual: sedeHabitual?.nombre ?? "",
      barberia_acepta_comunicaciones: consentimiento ? "true" : "false",
      barberia_notas: cliente.notas ?? "",
      barberia_cliente_desde: new Date(cliente.created_at).toLocaleDateString("es-ES"),
      barberia_visitas_completadas: String(stats.visitasCompletadas),
      barberia_gasto_total_eur: stats.gastoTotalEur.toFixed(2),
      barberia_servicio_favorito: stats.servicioFavorito,
      barberia_profesional_favorito: stats.profesionalFavorito,
      barberia_segmento: stats.segmento,
      lifecyclestage: "customer",
    };
    if (stats.ultimaVisitaISO) propiedades.barberia_ultima_visita = fechaAHubspotDate(stats.ultimaVisitaISO);
    if (cliente.email) propiedades.email = cliente.email;

    let hubspotId: string | null = cliente.hubspot_contact_id ?? null;

    if (hubspotId) {
      await hubspotFetch(`/crm/v3/objects/contacts/${hubspotId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: propiedades }),
      });
    } else {
      hubspotId = await buscarContactoPorClienteId(cliente.id);
      if (hubspotId) {
        await hubspotFetch(`/crm/v3/objects/contacts/${hubspotId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: propiedades }),
        });
      } else {
        const creado = (await hubspotFetch(`/crm/v3/objects/contacts`, {
          method: "POST",
          body: JSON.stringify({ properties: propiedades }),
        })) as { id: string };
        hubspotId = creado.id;
      }
      await supabase.from("clientes").update({ hubspot_contact_id: hubspotId }).eq("id", clienteId);
    }

    return hubspotId;
  } catch (err) {
    console.warn(`[hubspot] no se pudo sincronizar el cliente ${clienteId}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------
// Negocios (citas)
// ---------------------------------------------------------------------

export function estadoADealstage(estado: string): string {
  switch (estado) {
    case "completada":
      return STAGE_ID_COMPLETADA;
    case "cancelada":
      return STAGE_ID_CANCELADA;
    case "no_presentada":
      return STAGE_ID_NO_PRESENTADA;
    default:
      return STAGE_ID_CONFIRMADA;
  }
}

async function buscarDealPorCitaId(citaId: string): Promise<string | null> {
  const resultado = (await hubspotFetch(`/crm/v3/objects/deals/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "barberia_cita_id", operator: "EQ", value: citaId }] }],
      limit: 1,
    }),
  })) as { results?: { id: string }[] };
  return resultado?.results?.[0]?.id ?? null;
}

/**
 * Crea o actualiza el Negocio de HubSpot para ESTA cita (releyendo su
 * estado actual en Supabase). Asegura primero el Contacto del cliente y
 * asocia el Negocio a él. Cachea el id en citas.hubspot_deal_id. Nunca
 * lanza — ver sincronizarClienteHubSpot.
 */
export async function sincronizarCitaHubSpot(supabase: SupabaseClient, citaId: string): Promise<void> {
  if (!estaConfigurado()) return;

  try {
    await asegurarBootstrap();

    const { data: cita } = await supabase
      .from("citas")
      .select(
        "id, inicio, estado, origen, cliente_id, hubspot_deal_id, sede:sedes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
      )
      .eq("id", citaId)
      .maybeSingle();
    if (!cita) return;

    const contactoId = await sincronizarClienteHubSpot(supabase, cita.cliente_id);

    const servicio = uno(cita.servicio);
    const sede = uno(cita.sede);
    const profesional = uno(cita.profesional);
    const extras = cita.extras ?? [];
    const totalCentimos = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);
    const nombresExtras = extras.map((e) => uno(e.servicio)?.nombre).filter(Boolean).join(", ");

    const propiedades: Record<string, string | number> = {
      dealname: `${servicio?.nombre ?? "Servicio"}${nombresExtras ? ` + ${nombresExtras}` : ""}`,
      amount: totalCentimos / 100,
      dealstage: estadoADealstage(cita.estado),
      barberia_cita_id: cita.id,
      barberia_servicio: servicio?.nombre ?? "",
      barberia_profesional: profesional?.nombre ?? "Cualquiera",
      barberia_sede: sede?.nombre ?? "",
      barberia_estado_cita: cita.estado,
      barberia_origen: cita.origen,
      barberia_fecha_hora: new Date(cita.inicio).toLocaleString("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
      }),
    };

    let hubspotId: string | null = cita.hubspot_deal_id ?? null;
    let esNuevo = false;

    if (hubspotId) {
      await hubspotFetch(`/crm/v3/objects/deals/${hubspotId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: propiedades }),
      });
    } else {
      hubspotId = await buscarDealPorCitaId(cita.id);
      if (hubspotId) {
        await hubspotFetch(`/crm/v3/objects/deals/${hubspotId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: propiedades }),
        });
      } else {
        const creado = (await hubspotFetch(`/crm/v3/objects/deals`, {
          method: "POST",
          body: JSON.stringify({ properties: propiedades }),
        })) as { id: string };
        hubspotId = creado.id;
        esNuevo = true;
      }
      await supabase.from("citas").update({ hubspot_deal_id: hubspotId }).eq("id", citaId);
    }

    if (esNuevo && contactoId) {
      await hubspotFetch(`/crm/v4/objects/deals/${hubspotId}/associations/default/contacts/${contactoId}`, {
        method: "PUT",
      });
    }
  } catch (err) {
    console.warn(`[hubspot] no se pudo sincronizar la cita ${citaId}`, err);
  }
}
