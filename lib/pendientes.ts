import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Tareas importantes que solo puede hacer alguien con acceso a Supabase,
// Vercel, Meta o GitHub (pedido de David, 22/11/2026: "que lo vea Diego
// cuando entre a trabajar"). Las que la app puede comprobar sola
// desaparecen al hacerse; las demás se quitan de aquí cuando estén hechas.
// Lista completa y detallada: docs/PENDIENTES.md.

export interface Pendiente {
  id: string;
  prioridad: "urgente" | "importante";
  titulo: string;
  porQue: string;
  como: string;
}

async function existeTabla(tabla: string): Promise<boolean> {
  const { error } = await createAdminClient().from(tabla).select("*", { head: true, count: "exact" }).limit(1);
  return !error;
}

export async function pendientesAbiertos(): Promise<Pendiente[]> {
  const [caja, personal, stock, portafolio] = await Promise.all([
    existeTabla("caja_dias"),
    existeTabla("personal_config"),
    existeTabla("producto_stock_sede"),
    existeTabla("portafolio_fotos"),
  ]);
  const lista: (Pendiente | false)[] = [
    {
      id: "is-admin",
      prioridad: "urgente",
      titulo: "Ejecutar supabase/seguridad-solo-dueno.sql",
      porQue: "Ahora un barbero, con su usuario, podría leer o borrar los datos de todos los clientes directamente en la base de datos (riesgo de multa por protección de datos).",
      como: "Supabase → proyecto de la app → SQL Editor → pegar el archivo → Run. Cuando esté, quitar esta tarea de lib/pendientes.ts.",
    },
    !process.env.WHATSAPP_APP_SECRET && {
      id: "whatsapp-secret",
      prioridad: "urgente",
      titulo: "Poner WHATSAPP_APP_SECRET en Vercel",
      porQue: "Sin ella, alguien puede mandar mensajes falsos al bot haciéndose pasar por un cliente y cancelarle citas.",
      como: "Meta for Developers → la app de WhatsApp → Configuración → Básica → Clave secreta de la app. Copiarla en Vercel → Settings → Environment Variables y volver a desplegar.",
    },
    {
      id: "rotar-claves",
      prioridad: "urgente",
      titulo: "Cambiar las claves que se pegaron en el chat",
      porQue: "Se compartieron por chat al montar la app: service role de Supabase, token de WhatsApp, clave de Anthropic, token de GitHub y CRON_SECRET.",
      como: "Generar claves nuevas en cada servicio, ponerlas en Vercel (y CRON_SECRET también en GitHub → Secrets) y borrar las viejas. Cuando esté, quitar esta tarea de lib/pendientes.ts.",
    },
    !process.env.CLIENTE_SESSION_SECRET && {
      id: "sesion-secret",
      prioridad: "importante",
      titulo: "Poner CLIENTE_SESSION_SECRET en Vercel",
      porQue: "Firma la sesión de los clientes. Hoy usa la clave de Supabase; si se cambia esa clave, todos los clientes tendrían que volver a entrar.",
      como: "Inventar una frase larga al azar y añadirla en Vercel → Environment Variables.",
    },
    {
      id: "repo-privado",
      prioridad: "importante",
      titulo: "Poner el repositorio de GitHub en privado y activar Dependabot",
      porQue: "El código es público: cualquiera puede leerlo y buscar fallos.",
      como: "GitHub → barberiagrasso/barberiagrasso → Settings → Danger Zone → Change visibility → Private. Después Settings → Code security → activar Dependabot alerts. Cuando esté, quitar esta tarea de lib/pendientes.ts.",
    },
    !caja && {
      id: "sql-caja",
      prioridad: "importante",
      titulo: "Ejecutar supabase/anadir-cierre-caja.sql",
      porQue: "Sin esto no funciona Caja (apertura y cierre) ni el bloqueo de cobrar con la caja sin abrir.",
      como: "Supabase → SQL Editor → pegar el archivo → Run. Luego elegir el encargado de caja de cada sede en Finanzas → Caja.",
    },
    !personal && {
      id: "sql-personal",
      prioridad: "importante",
      titulo: "Ejecutar supabase/anadir-personal.sql",
      porQue: "Sin esto no se guardan los sueldos ni las metas de Personal.",
      como: "Supabase → SQL Editor → pegar el archivo → Run.",
    },
    !stock && {
      id: "sql-stock",
      prioridad: "importante",
      titulo: "Ejecutar supabase/anadir-stock-por-sede.sql",
      porQue: "Sin esto no funciona el stock por sede ni los encargados de stock.",
      como: "Supabase → SQL Editor → pegar el archivo → Run.",
    },
    !portafolio && {
      id: "sql-portafolio",
      prioridad: "importante",
      titulo: "Ejecutar supabase/anadir-portafolio-y-resenas.sql",
      porQue: "Sin esto no se pueden subir fotos al portafolio desde el panel.",
      como: "Supabase → SQL Editor → pegar el archivo → Run.",
    },
  ];
  return lista.filter((p): p is Pendiente => Boolean(p));
}
