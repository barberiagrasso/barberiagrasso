"use client";

/*
  Cabecera compartida de todo el user journey (pedido de Diego, 08/11/2026): el mismo logo
  centrado en todos los pasos (home nueva, reservar, perfil, portafolio, tienda, política de
  privacidad), que siempre lleva de vuelta a / — desde el cutover a producción (20/11/2026)
  la home nueva ES la portada real, ya no una vista previa en /nueva-home.
  Antes esto vivía duplicado dentro de NuevaHomeClient; ahora todas las páginas usan este
  mismo componente para que no se puedan desincronizar.
*/

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { CerrarSesionButton } from "@/components/brand/CerrarSesionButton";
import styles from "./journey.module.css";

export interface JourneyHeaderProps {
  cliente: { nombre: string } | null;
  /**
   * "reservando" (pedido de Diego, 09/11/2026): para la propia pantalla de
   * reserva. Ya estamos dentro, así que no tiene sentido ofrecer "Reservar
   * cita" — en su lugar se ve el acceso a "Mi perfil" y, si ya hay sesión,
   * también "Cerrar sesión".
   */
  variante?: "reservando";
}

export function JourneyHeader({ cliente, variante }: JourneyHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const header = headerRef.current;
    const onScroll = () => header?.classList.toggle(styles.scrolled, window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header ref={headerRef} className={styles.siteHeader}>
      {/* Primer elemento enfocable de la página: oculto hasta que recibe foco
          por teclado, salta el hero/menú y lleva directo al <main> de cada
          paso (hallazgo de la auditoría de diseño web, 20/11/2026). */}
      <a href="#contenido" className={styles.skipLink}>Saltar al contenido</a>

      {/* Dentro del paso a paso de reserva (variante "reservando"), el logo
          no saca de la reserva a la home con la silla: vuelve al principio
          de este mismo user journey (pedido de Diego, 20/11/2026). */}
      <Link
        href={variante === "reservando" ? "/reservar" : "/"}
        className={styles.siteHeaderLogo}
        aria-label={variante === "reservando" ? "Barbería Grasso, volver al inicio de la reserva" : "Barbería Grasso, inicio"}
      >
        <GrassoLogo />
      </Link>

      <nav className={styles.siteHeaderNav} aria-label="Principal">
        <Link href="/portafolio">Trabajos</Link>
        <Link href="/#sedes">Sedes</Link>
        <Link href="/tienda">Tienda</Link>
      </nav>

      <div className={styles.siteHeaderSide}>
        {variante === "reservando" ? (
          cliente ? (
            <>
              <Link href="/perfil" className={`${styles.btn} ${styles.btnSmall}`}>Mi perfil</Link>
              <CerrarSesionButton className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`} />
            </>
          ) : (
            <Link href="/acceso?next=%2Freservar" className={`${styles.btn} ${styles.btnSmall}`}>Entrar</Link>
          )
        ) : (
          <>
            <Link href="/perfil" className={styles.siteHeaderAccount}>{cliente ? "Mi perfil" : "Entrar"}</Link>
            <Link href="/reservar" className={`${styles.btn} ${styles.btnSmall}`}>Reservar cita</Link>
          </>
        )}
      </div>
      {pathname !== "/" && !pathname?.startsWith("/reservar") && (
        <Link href="/" className={styles.homePill} aria-label="Ir al inicio">
          <span aria-hidden>←</span> Inicio
        </Link>
      )}
    </header>
  );
}
