"use client";

/*
  Resto del diseño de Diego (grasso-web.zip) ya con datos reales: cabecera, sedes (de la base de
  datos real, sin teléfonos — decisión de Diego, 08/11/2026), reseñas de Google, cierre y pie. El
  hero 3D vive en HeroChair.tsx; aquí solo lo montamos junto al resto de la página y llevamos las
  animaciones de scroll (GSAP ScrollTrigger) que no son del sillón: revelado de bloques, cabecera
  que se oscurece al bajar y sedes que se amplían al pulsarlas (clic/tap en cualquier dispositivo;
  en escritorio además al pasar el ratón, vía CSS).
  Antes había una segunda sección ("manifiesto": marquesina + texto + estadísticas) entre el hero
  y las sedes; Diego pidió quitarla y pasar directo del hero a las sedes, que ahora llevan fondo
  blanco (antes solo lo llevaba el manifiesto) para que siga habiendo ese contraste justo después
  del hero oscuro (pedido de Diego, 13/11/2026).
*/

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BotonInstalarApp } from "@/components/pwa/BotonInstalarApp";
import { BotonCompartir } from "@/components/brand/BotonCompartir";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import type { ResenasExternasSede } from "@/lib/portafolio";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import { HeroChair } from "./HeroChair";
import styles from "./nueva-home.module.css";

gsap.registerPlugin(ScrollTrigger);

export interface SedeNueva {
  id: string;
  nombre: string;
  direccion: string | null;
  maps_url: string | null;
}

export interface NuevaHomeClientProps {
  cliente: { nombre: string } | null;
  sedes: SedeNueva[];
  resenas: Record<string, ResenasExternasSede>;
  repetir: { href: string; barbero: string; servicio: string } | null;
  works: string[];
}

// Fotos reales de fachada de cada sede (las que mandó Diego, 08/11/2026) — antes se usaba aquí
// una foto cualquiera de trabajo como relleno, y eso era justo el problema que reportó (además
// de no ser la fachada real, el texto blanco podía caer sobre una zona clara de la foto). Se
// identifican por el nombre de la sede en vez de por su id, porque así sigue funcionando si se
// reordenan o renombran ligeramente en el admin.
function fotoSede(nombre: string): string | null {
  const n = nombre.toLowerCase();
  if (n.includes("molino")) return "/nueva-home/sede-los-molinos.webp";
  if (n.includes("ciudades")) return "/nueva-home/sede-las-ciudades.webp";
  return null;
}

export function NuevaHomeClient({ cliente, sedes, resenas, repetir, works }: NuevaHomeClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openSede, setOpenSede] = useState<string | null>(null);

  useEffect(() => {
    // Con "reducir movimiento" activado en el sistema, se enseñan los
    // bloques ya visibles (sin el deslizamiento) y se quita por completo
    // el parallax de las fotos flotantes — ambos son decorativos, no
    // aportan información.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        if (reduceMotion) {
          gsap.set(el, { opacity: 1, y: 0 });
          return;
        }
        gsap.from(el, {
          opacity: 0, y: 28, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
      });
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, []);

  function toggleSede(id: string) {
    setOpenSede((cur) => (cur === id ? null : id));
    window.setTimeout(() => ScrollTrigger.refresh(), 850);
  }

  const direccionesFooter = sedes.map((s) => s.direccion).filter(Boolean).join(" · ");

  return (
    <div ref={rootRef} className={`${styles.page} ${journeyFontVars}`}>
      <JourneyHeader cliente={cliente} />

      <main id="top">
        <HeroChair works={works} />

        <section className={styles.sedes} id="sedes">
          <div className={styles.sedesHead}>
            <p className={styles.eyebrow} data-reveal>Nuestras sedes</p>
            <h2 data-reveal>Dos casas,<br />una familia.</h2>
          </div>

          <div className={`${styles.sedesGrid} ${openSede ? styles.hasOpen : ""}`}>
            {sedes.map((sede, i) => {
              const abierta = openSede === sede.id;
              const foto = fotoSede(sede.nombre) ?? works[i % works.length];
              return (
                <article
                  key={sede.id}
                  tabIndex={0}
                  role="button"
                  aria-expanded={abierta}
                  aria-label={`Sede ${sede.nombre}, ${abierta ? "cerrar" : "ampliar"}`}
                  className={`${styles.sede} ${abierta ? styles.isOpen : ""}`}
                  onClick={() => toggleSede(sede.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSede(sede.id); }
                  }}
                >
                  <div className={styles.sedeMedia}>
                    {foto && <img src={foto} alt={`Local de Barbería Grasso en ${sede.nombre}`} loading="lazy" />}
                  </div>
                  <div className={styles.sedeShade} aria-hidden="true" />
                  <span className={styles.sedeNum} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <div className={styles.sedeInfo}>
                    <p className={styles.sedeZone}>Getafe · {sede.nombre}</p>
                    <h3>{sede.nombre}</h3>
                    {sede.direccion && <p className={styles.sedeAddr}>{sede.direccion}</p>}
                    <NotasResenas resenas={resenas[sede.id]} className="mt-2" />
                    <div className={styles.sedeMore}>
                      <div className={styles.sedeMoreInner}>
                        <div className={styles.sedeActions} onClick={(e) => e.stopPropagation()}>
                          <Link href={`/reservar?sede=${sede.id}`} className={styles.btn}>Reservar en esta sede</Link>
                          {sede.maps_url && (
                            <a href={sede.maps_url} target="_blank" rel="noreferrer" className={`${styles.btn} ${styles.btnGhost}`}>
                              Cómo llegar
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className={styles.sedeHint} aria-hidden="true">Ver local +</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.resenas} aria-label="Reseñas de clientes en Google">
          <div className={styles.resenasHead}>
            <p className={styles.eyebrow} data-reveal>Reseñas reales</p>
            <h2 data-reveal>Lo que dicen<br />en Google.</h2>
          </div>

          <div className={styles.resenasGrid} data-reveal>
            {sedes.map((sede) => {
              const google = resenas[sede.id]?.google;
              if (google?.nota == null) return null;
              const notaTexto = google.nota.toLocaleString("es-ES", { minimumFractionDigits: 1 });
              const pct = Math.max(0, Math.min(100, (google.nota / 5) * 100));
              return (
                <a
                  key={sede.id}
                  href={google.url ?? sede.maps_url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.resenaCard}
                >
                  <span className={styles.resenaMarca} aria-hidden="true">
                    <IconoGoogle />
                    Google
                  </span>
                  <strong className={styles.resenaNota}>{notaTexto}</strong>
                  <span
                    className={styles.resenaEstrellas}
                    style={{ "--pct": `${pct}%` } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    ★★★★★
                  </span>
                  <span className={styles.resenaSede}>{sede.nombre}</span>
                  <span className={styles.resenaTotal}>
                    {google.total ? `${google.total.toLocaleString("es-ES")} reseñas en Google` : "Reseñas en Google"}
                  </span>
                  <span className={styles.resenaCta}>Ver todas las reseñas en Google →</span>
                </a>
              );
            })}
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.ctaPole} aria-hidden="true" />
          <h2 data-reveal>¿Listo para verte<br />como te sientes?</h2>
          <div className={styles.ctaActions} data-reveal>
            <Link href="/reservar" className={styles.btn}>Reservar cita</Link>
            <a href="#sedes" className={`${styles.btn} ${styles.btnGhost}`}>Elige tu sede</a>
          </div>

          <div className={styles.ctaExtra}>
            {repetir && (
              <Link href={repetir.href} className={styles.btnOutlineYellow}>
                Repetir {repetir.servicio.toLowerCase()} con {repetir.barbero}
              </Link>
            )}
            <Link href="/perfil" className={styles.btnOutlineYellow}>
              {cliente ? "Mi perfil y mis citas" : "Mi perfil"}
            </Link>
            <BotonInstalarApp />
            <BotonCompartir path="/nueva-home" titulo="Barbería Grasso" texto="Reserva tu cita en Barbería Grasso desde el móvil." />
          </div>
        </section>
      </main>

      <JourneyFooter direcciones={direccionesFooter} />
    </div>
  );
}

function IconoGoogle() {
  // Marca estándar de atribución "G" de Google (misma usada en botones de
  // "Acceder con Google"): aquí solo para dejar claro de dónde viene la nota,
  // no copiamos ni mostramos el texto de ninguna reseña.
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.455 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
    </svg>
  );
}
