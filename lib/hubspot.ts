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

// ---------------------------------------------------------------------
// Propiedades personalizadas: se crean solas la primera vez que hacen
// falta (una por servidor/arranque, en memoria) — Diego no tiene que
// tocar nada a mano en HubSpot.
// ---------------------------------------------------------------------

interface DefinicionPropiedad {
  name: string;
  label: string;
  type: "string" | "bool" | "enumeration";
  fieldType: "text" | "textarea" | "booleancheckbox" | "select";
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

let propiedadesListas: Promise<void> | null = null;

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

function asegurarPropiedades(): Promise<void> {
  if (!propiedadesListas) {
    propiedadesListas = (async () => {
      await Promise.all([
        ...PROPIEDADES_CONTACTO.map((p) => asegurarPropiedad("contacts", p)),
        ...PROPIEDADES_NEGOCIO.map((p) => asegurarPropiedad("deals", p)),
      ]);
    })();
  }
  return propiedadesListas;
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

/**
 * Crea o actualiza el Contacto de HubSpot para ESTE cliente (releyendo su
 * estado actual en Supabase, incluido el consentimiento comercial). Cachea
 * el id de HubSpot en clientes.hubspot_contact_id para no tener que
 * volver a buscarlo la próxima vez. Nunca lanza — si algo falla, se
 * registra en consola y se sigue sin más.
 */
export async function sincronizarClienteHubSpot(
  supabase: SupabaseClient,
  clienteId: string
): Promise<string | null> {
  if (!estaConfigurado()) return null;

  try {
    await asegurarPropiedades();

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

    const sedeHabitual = Array.isArray(cliente.sede_habitual) ? cliente.sede_habitual[0] : cliente.sede_habitual;
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
      lifecyclestage: "customer",
    };
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

function estadoADealstage(estado: string): string {
  switch (estado) {
    case "completada":
      return "closedwon";
    case "cancelada":
    case "no_presentada":
      return "closedlost";
    default:
      return "appointmentscheduled";
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
    await asegurarPropiedades();

    const { data: cita } = await supabase
      .from("citas")
      .select(
        "id, inicio, estado, origen, cliente_id, hubspot_deal_id, sede:sedes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
      )
      .eq("id", citaId)
      .maybeSingle();
    if (!cita) return;

    const contactoId = await sincronizarClienteHubSpot(supabase, cita.cliente_id);

    const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
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
