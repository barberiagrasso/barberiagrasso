import { createPublicClient } from "@/lib/supabase/public";
import { cargarFotosPortafolio, cargarResenasExternas } from "@/lib/portafolio";
import { FOTOS_PORTAFOLIO_FIJAS } from "@/lib/portafolioFijo";
import Link from "next/link";
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

      <main id="contenido">
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

          {/* Guía de estilos de Grasso (cartel). Al tocarla se abre en grande
              para ampliarla con los dedos. */}
          <section style={{ marginBottom: 32 }}>
            <h2
              style={{
                marginBottom: 8,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textAlign: "center",
                opacity: 0.85,
              }}
            >
              ¿Qué estilo llevas hoy?
            </h2>
            <a
              href="/media/cartel-estilos.jpg"
              target="_blank"
              rel="noreferrer"
              style={{ display: "block", overflow: "hidden", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/media/cartel-estilos.jpg"
                alt="Guía de estilos de Barbería Grasso: cortes, barbas, cortes infantiles y servicios"
                style={{ display: "block", width: "100%", height: "auto" }}
              />
            </a>
            <p style={{ marginTop: 6, textAlign: "center", fontSize: 12, opacity: 0.7 }}>
              Toca la imagen para verla en grande.
            </p>
            <Link
              href="/estilo"
              style={{
                display: "block",
                marginTop: 12,
                padding: "12px 16px",
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 12,
                border: "1px solid rgba(240,200,40,0.5)",
              }}
            >
              ✨ ¿No sabes cuál elegir? Descubre tu estilo con IA
            </Link>
          </section>

          <PortafolioPublico fotos={[...fotos, ...FOTOS_PORTAFOLIO_FIJAS]} servicios={servicios ?? []} sedes={sedes ?? []} />
        </div>
      </main>

      <JourneyFooter />
    </div>
  );
}
