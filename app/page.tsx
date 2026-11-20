import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarResenasExternas } from "@/lib/portafolio";
import { NuevaHomeClient } from "./nueva-home/NuevaHomeClient";

export const dynamic = "force-dynamic";

const WORKS = Array.from({ length: 12 }, (_, i) => `/nueva-home/ig/trabajo-${String(i + 1).padStart(2, "0")}.jpg`);

// Cutover a producción (20/11/2026, pedido de Diego): esta es ahora la portada real.
// Antes vivía en app/nueva-home/page.tsx como vista previa aparte (hero 3D del sillón +
// el resto del rediseño de v2) mientras la home vieja de David seguía en esta ruta; esa
// vieja home ha sido sustituida. app/nueva-home/page.tsx se deja como redirección a "/"
// por si queda algún enlace suelto a la ruta antigua. Los componentes (NuevaHomeClient,
// HeroChair, nueva-home.module.css) se quedan en su carpeta original: solo se movió el
// page.tsx de la ruta.
export const metadata: Metadata = {
  title: "Barbería Grasso — Reserva tu cita",
  description: "Reserva tu cita online en Barbería Grasso, Getafe: Los Molinos y Avenida de las Ciudades.",
  openGraph: {
    title: "Barbería Grasso",
    description: "Reserva tu cita online en Los Molinos y Avenida de las Ciudades (Getafe).",
    url: "/",
    siteName: "Barbería Grasso",
    locale: "es_ES",
    type: "website",
  },
};

export default async function Home() {
  const cliente = (await obtenerClienteActual())?.cliente ?? null;

  const supabase = createPublicClient();
  const [{ data: sedes }, resenas, { data: ultimas }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, direccion, maps_url").order("nombre"),
    cargarResenasExternas(supabase),
    cliente
      ? createAdminClient()
          .from("citas")
          .select("sede_id, servicio_id, profesional_id, profesional:profesionales(nombre, activo), servicio:servicios(nombre, activo)")
          .eq("cliente_id", cliente.id)
          .eq("estado", "completada")
          .not("profesional_id", "is", null)
          .order("inicio", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);

  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const ultima = ultimas?.[0];
  const barberoUltima = uno(ultima?.profesional as { nombre: string; activo: boolean } | { nombre: string; activo: boolean }[] | null);
  const servicioUltima = uno(ultima?.servicio as { nombre: string; activo: boolean } | { nombre: string; activo: boolean }[] | null);
  const repetir =
    ultima && barberoUltima?.activo && servicioUltima?.activo
      ? {
          href: `/reservar?${new URLSearchParams({ sede: ultima.sede_id, servicio: ultima.servicio_id, barbero: ultima.profesional_id! })}`,
          barbero: barberoUltima.nombre.split(" ")[0],
          servicio: servicioUltima.nombre,
        }
      : null;

  return (
    <NuevaHomeClient
      cliente={cliente ? { nombre: cliente.nombre } : null}
      sedes={sedes ?? []}
      resenas={resenas}
      repetir={repetir}
      works={WORKS}
    />
  );
}
