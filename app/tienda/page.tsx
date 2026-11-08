import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import journeyStyles from "@/components/journey/journey.module.css";
import styles from "./tienda.module.css";

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

// Tienda de la app (pedido de Diego, 27/10/2026). Rediseño completo al estilo de /nueva-home,
// 08/11/2026 — misma lógica de datos y de "no hay pago online", solo cambia la piel visual.
export default async function TiendaPage() {
  const cliente = (await obtenerClienteActual())?.cliente ?? null;

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
    <div className={`${journeyStyles.journeyPage} ${journeyFontVars}`}>
      <JourneyHeader cliente={cliente ? { nombre: cliente.nombre } : null} />

      <main>
        <div className={journeyStyles.pageHead}>
          <p className={journeyStyles.eyebrow}>Tienda Grasso</p>
          <h1>Lleva algo<br />de Grasso.</h1>
          <p className={styles.lede}>Pídelo en tu próxima visita: lo pagas en la barbería o lo canjeas con tus GrassoCoins.</p>
          <Link href="/perfil/tarjeta" className={styles.coins}>Mis GrassoCoins →</Link>
        </div>

        <div className={styles.body}>
          {productos.length === 0 ? (
            <p className={styles.empty}>Muy pronto tendrás aquí nuestro merch.</p>
          ) : (
            Array.from(grupos.entries()).map(([categoria, items]) => (
              <section key={categoria} className={styles.grupo}>
                <h2>{categoria}</h2>
                <div className={styles.grid}>
                  {items.map((p) => (
                    <div key={p.id} className={styles.card}>
                      {p.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.foto_url} alt={p.nombre} loading="lazy" className={styles.cardMedia} />
                      ) : (
                        <div className={styles.cardPlaceholder}>G</div>
                      )}
                      <div className={styles.cardBody}>
                        <p className={styles.cardName}>{p.nombre}</p>
                        {p.descripcion && <p className={styles.cardDesc}>{p.descripcion}</p>}
                        <p className={styles.cardPrice}>{euros(p.precio_centimos)}</p>
                        {p.coste_grassocoins && <p className={styles.cardCoins}>o {p.coste_grassocoins} GrassoCoins</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>

      <JourneyFooter />
    </div>
  );
}
