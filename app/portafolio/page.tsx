import { createPublicClient } from "@/lib/supabase/public";
import { cargarFotosPortafolio, cargarResenasExternas } from "@/lib/portafolio";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import journeyStyles from "@/components/journey/journey.module.css";
import styles from "./portafolio.module.css";
import PortafolioPublico from "./PortafolioPublico";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nuestros trabajos · Barbería Grasso",
  description: "Cortes, degradados, barbas y más: mira los trabajos de Barbería Grasso en Getafe.",
  openGraph: {
    title: "Nuestros trabajos · Barbería Grasso",
    description: "Cortes, degradados, barbas y más: mira los trabajos de Barbería Grasso en Getafe.",
    url: "/portafolio",
    siteName: "Barbería Grasso",
    locale: "es_ES",
    type: "website",
  },
};

// Página pública (sin necesidad de iniciar sesión) con todos los trabajos del portafolio — pedido
// de Diego, 27/10/2026. Rediseño completo al estilo de /nueva-home, 08/11/2026.
export default async function PortafolioPage() {
  const [cliente, supabase] = [(await obtenerClienteActual())?.cliente ?? null, createPublicClient()];
  const [fotos, resenas, { data: servicios }, { data: sedes }] = await Promise.all([
    cargarFotosPortafolio(supabase),
    cargarResenasExternas(supabase),
    supabase.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("sedes").select("id, nombre").order("nombre"),
  ]);

  return (
    <div className={`${journeyStyles.journeyPage} ${journeyFontVars}`}>
      <JourneyHeader cliente={cliente ? { nombre: cliente.nombre } : null} />

      <main>
        <div className={journeyStyles.pageHead} style={{ textAlign: "center" }}>
          <p className={journeyStyles.eyebrow}>Trabajos reales · @barberia.grasso</p>
          <h1>Cada silla,<br />un estilo.</h1>
        </div>

        <div className={styles.body}>
          {(sedes ?? []).some((sede) => resenas[sede.id]) && (
            <div className={styles.resenas}>
              {(sedes ?? []).map((sede) =>
                resenas[sede.id] ? (
                  <div key={sede.id} className={styles.resenaSede}>
                    <p>{sede.nombre}</p>
                    <NotasResenas resenas={resenas[sede.id]} className="justify-center" />
                  </div>
                ) : null,
              )}
            </div>
          )}

          <PortafolioPublico fotos={fotos} servicios={servicios ?? []} sedes={sedes ?? []} />
        </div>
      </main>

      <JourneyFooter />
    </div>
  );
}
