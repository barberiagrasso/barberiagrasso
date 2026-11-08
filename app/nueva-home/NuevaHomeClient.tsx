"use client";

/*
  Resto del diseño de Diego (grasso-web.zip) ya con datos reales: cabecera, manifiesto con
  marquesina + parallax, sedes (de la base de datos real, sin teléfonos — decisión de Diego,
  08/11/2026), cierre y pie. El hero 3D vive en HeroChair.tsx; aquí solo lo montamos junto al
  resto de la página y llevamos las animaciones de scroll (GSAP ScrollTrigger) que no son del
  sillón: revelado de bloques, marquesina continua, parallax de fotos flotantes, cabecera que se
  oscurece al bajar y sedes que se amplían al pulsarlas (clic/tap en cualquier dispositivo; en
  escritorio además al pasar el ratón, vía CSS).
*/

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { BotonInstalarApp } from "@/components/pwa/BotonInstalarApp";
import { BotonCompartir } from "@/components/brand/BotonCompartir";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import type { ResenasExternasSede } from "@/lib/portafolio";
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

const MARQUEE_LINES = [
  { text: "Corte · Barba · Afeitado · ", outline: false, duration: 32 },
  { text: "Kids Grasso · Grasso Experience · ", outline: true, duration: 40 },
  { text: "Precisión · Estilo · Actitud · ", outline: false, duration: 26 },
];

export function NuevaHomeClient({ cliente, sedes, resenas, repetir, works }: NuevaHomeClientProps) {
  const headerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const manifestoRef = useRef<HTMLDivElement>(null);
  const floatARef = useRef<HTMLImageElement>(null);
  const floatBRef = useRef<HTMLImageElement>(null);
  const [openSede, setOpenSede] = useState<string | null>(null);

  const mejorNota = Object.values(resenas)
    .flatMap((r) => [r.google?.nota, r.booksy?.nota])
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => b - a)[0];

  useEffect(() => {
    const header = headerRef.current;
    const onScroll = () => header?.classList.toggle(styles.scrolled, window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          opacity: 0, y: 28, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
      });

      if (floatARef.current) {
        gsap.to(floatARef.current, {
          y: -70, ease: "none",
          scrollTrigger: { trigger: manifestoRef.current, start: "top bottom", end: "bottom top", scrub: true },
        });
      }
      if (floatBRef.current) {
        gsap.to(floatBRef.current, {
          y: 90, ease: "none",
          scrollTrigger: { trigger: manifestoRef.current, start: "top bottom", end: "bottom top", scrub: true },
        });
      }
    }, rootRef);

    return () => {
      window.removeEventListener("scroll", onScroll);
      ctx.revert();
    };
  }, []);

  function toggleSede(id: string) {
    setOpenSede((cur) => (cur === id ? null : id));
    window.setTimeout(() => ScrollTrigger.refresh(), 850);
  }

  const direccionesFooter = sedes.map((s) => s.direccion).filter(Boolean).join(" · ");

  return (
    <div ref={rootRef} className={styles.page}>
      <header ref={headerRef} className={styles.siteHeader}>
        <a href="#top" className={styles.siteHeaderLogo} aria-label="Barbería Grasso, inicio">
          <GrassoLogo />
        </a>
        <nav className={styles.siteHeaderNav} aria-label="Principal">
          <Link href="/portafolio">Trabajos</Link>
          <a href="#sedes">Sedes</a>
          <Link href="/tienda">Tienda</Link>
          <Link href="/perfil">{cliente ? "Mi perfil" : "Entrar"}</Link>
        </nav>
        <div className={styles.siteHeaderActions}>
          <Link href="/reservar" className={`${styles.btn} ${styles.btnSmall}`}>Reservar cita</Link>
        </div>
      </header>

      <main id="top">
        <HeroChair works={works} />

        <section ref={manifestoRef} className={styles.manifesto} aria-label="Lo que hacemos">
          <div className={styles.manifestoLines} aria-hidden="true">
            {MARQUEE_LINES.map((line, i) => (
              <MarqueeLine key={i} text={line.text} outline={line.outline} duration={line.duration} />
            ))}
          </div>

          <div className={styles.manifestoBody}>
            <div data-reveal>
              <p className={styles.eyebrow}>Barbería Grasso</p>
              <p className={styles.lead}>
                Más que un corte. Tradición, precisión y actitud hecha estilo. Te escuchamos, te
                asesoramos y cuidamos cada detalle para que salgas viéndote como realmente te sientes.
              </p>
            </div>
            <ul className={styles.manifestoStats} data-reveal>
              <li><strong>{sedes.length || 2}</strong><span>sedes en Getafe</span></li>
              <li>
                <strong>{mejorNota ? mejorNota.toLocaleString("es-ES", { minimumFractionDigits: 1 }) : "★"}</strong>
                <span>valoración de nuestros clientes</span>
              </li>
              <li><strong>2017</strong><span>cuidando de tu imagen</span></li>
            </ul>
          </div>

          {works[5] && (
            <img
              ref={floatARef}
              className={`${styles.manifestoFloat} ${styles.manifestoFloatA}`}
              src={works[5]}
              alt="Degradado con raya hecho en Grasso"
              loading="lazy"
            />
          )}
          {works[11] && (
            <img
              ref={floatBRef}
              className={`${styles.manifestoFloat} ${styles.manifestoFloatB}`}
              src={works[11]}
              alt="Servicio de cuidado facial en Grasso"
              loading="lazy"
            />
          )}
        </section>

        <section className={styles.sedes} id="sedes">
          <div className={styles.sedesHead}>
            <p className={styles.eyebrow} data-reveal>Nuestras sedes</p>
            <h2 data-reveal>Dos casas,<br />una familia.</h2>
          </div>

          <div className={`${styles.sedesGrid} ${openSede ? styles.hasOpen : ""}`}>
            {sedes.map((sede, i) => {
              const abierta = openSede === sede.id;
              const foto = works[i % works.length];
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

      <footer className={styles.siteFooter}>
        <GrassoLogo className={styles.siteFooterLogo} />
        <p>Cuidamos de tu imagen · Men&apos;s salon</p>
        {direccionesFooter && (
          <p className={styles.siteFooterSmall}>
            {direccionesFooter} · © {new Date().getFullYear()} Barbería Grasso®
          </p>
        )}
        <p className={styles.siteFooterLinks}>
          <Link href="/portafolio">Nuestros trabajos</Link>
          <Link href="/tienda">Tienda</Link>
          <Link href="/politica-privacidad">Política de privacidad</Link>
        </p>
      </footer>
    </div>
  );
}

function MarqueeLine({ text, outline, duration }: { text: string; outline: boolean; duration: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tween = gsap.fromTo(el, { xPercent: 0 }, { xPercent: -50, duration, ease: "none", repeat: -1 });
    return () => { tween.kill(); };
  }, [duration]);
  const repeated = text.repeat(6);
  return (
    <div ref={ref} className={`${styles.manifestoLine} ${outline ? styles.manifestoLineOutline : ""}`}>
      {repeated}
    </div>
  );
}
