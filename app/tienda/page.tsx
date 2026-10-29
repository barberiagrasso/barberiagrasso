import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrassoLogo } from "@/components/brand/GrassoLogo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tienda · Barbería Grasso",
  description: "Merch y productos de Barbería Grasso: cómpralos en la barbería o canjéalos con tus GrassoCoins.",
};

interface ProductoTienda {
  id: string;
  nombre: string;
  categoria: string | null;
  descripcion: string | null;
  precio_centimos: number;
  coste_grassocoins: number | null;
  foto_url: string | null;
  orden: number;
}

function euros(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Tienda de la app (pedido de Diego, 27/10/2026): merch y productos que él
// marca como "visible en la app" en Mi barbería → Productos. No hay pago
// online: se compran en la barbería o se canjean con GrassoCoins al cobrar
// la cita. Página pública, para poder compartirla. Se lee con el cliente de
// servicio porque la tabla productos solo la ve el equipo; aquí solo se
// eligen los activos y visibles, y solo los campos de escaparate.
export default async function TiendaPage() {
  let productos: ProductoTienda[] = [];
  try {
    const { data, error } = await createAdminClient()
      .from("productos")
      .select("id, nombre, categoria, descripcion, precio_centimos, coste_grassocoins, foto_url, orden")
      .eq("activo", true)
      .eq("visible_en_app", true)
      .order("categoria", { nullsFirst: true })
      .order("orden");
    if (!error) productos = (data ?? []) as ProductoTienda[];
  } catch {
    productos = [];
  }

  const grupos = new Map<string, ProductoTienda[]>();
  for (const p of productos) {
    const clave = p.categoria ?? "Productos";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(p);
  }

  return (
    <main className="min-h-screen bg-brand-black px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            ← Inicio
          </Link>
          <Link
            href="/perfil/tarjeta"
            className="font-body text-sm font-semibold text-brand-yellow underline decoration-brand-yellow/40 underline-offset-4"
          >
            Mis GrassoCoins
          </Link>
        </div>

        <div className="mb-8 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-28 text-brand-white" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">Tienda Grasso</h1>
          <p className="mt-2 max-w-sm font-body text-sm text-brand-white-dim">
            Pídelo en tu próxima visita: lo pagas en la barbería o lo canjeas con tus GrassoCoins.
          </p>
        </div>

        {productos.length === 0 ? (
          <p className="text-center font-body text-sm text-brand-white-dim">Muy pronto tendrás aquí nuestro merch.</p>
        ) : (
          <div className="space-y-8">
            {Array.from(grupos.entries()).map(([categoria, items]) => (
              <section key={categoria}>
                <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-brand-yellow">{categoria}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {items.map((p) => (
                    <div key={p.id} className="overflow-hidden rounded-2xl border border-brand-line bg-brand-black-soft/60">
                      {p.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.foto_url} alt={p.nombre} loading="lazy" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-white/5 font-heading text-3xl italic text-brand-white-dim/40">
                          G
                        </div>
                      )}
                      <div className="p-3">
                        <p className="font-heading text-sm text-brand-white">{p.nombre}</p>
                        {p.descripcion && <p className="mt-0.5 font-body text-xs text-brand-white-dim">{p.descripcion}</p>}
                        <p className="mt-2 font-mono text-sm text-brand-white">{euros(p.precio_centimos)}</p>
                        {p.coste_grassocoins && (
                          <p className="font-body text-xs font-semibold text-brand-yellow">o {p.coste_grassocoins} GrassoCoins</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
