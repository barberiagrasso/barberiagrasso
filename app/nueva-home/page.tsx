import { createPublicClient } from "@/lib/supabase/public";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarResenasExternas } from "@/lib/portafolio";
import { NuevaHomeClient } from "./NuevaHomeClient";

export const dynamic = "force-dynamic";

const WORKS = Array.from({ length: 12 }, (_, i) => `/nueva-home/ig/trabajo-${String(i + 1).padStart(2, "0")}.jpg`);

// Nuevo diseño de portada (grasso-web.zip, pedido de Diego 08/11/2026), ya con datos reales:
// mismas sedes, reseñas, "repetir con tu barbero", Mi perfil, instalar app y compartir que
// app/page.tsx — pero con el hero 3D del sillón y el resto del diseño que Diego eligió.
// Ruta aparte en preview: NO sustituye a app/page.tsx hasta que Diego la revise.
export default async function NuevaHome() {
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
