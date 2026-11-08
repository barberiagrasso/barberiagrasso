/*
  Pie compartido de todo el user journey. Server component (no hace falta cliente): recibe ya
  calculada la línea de direcciones cuando la página la tiene a mano (hoy solo /nueva-home, que
  carga las sedes); el resto de páginas lo omiten y el pie se queda sin esa línea.
*/
import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import styles from "./journey.module.css";

export interface JourneyFooterProps {
  direcciones?: string;
}

export function JourneyFooter({ direcciones }: JourneyFooterProps) {
  return (
    <footer className={styles.siteFooter}>
      <GrassoLogo className={styles.siteFooterLogo} />
      <p>Cuidamos de tu imagen · Men&apos;s salon</p>
      {direcciones && (
        <p className={styles.siteFooterSmall}>
          {direcciones} · © {new Date().getFullYear()} Barbería Grasso®
        </p>
      )}
      <p className={styles.siteFooterLinks}>
        <Link href="/portafolio">Nuestros trabajos</Link>
        <Link href="/tienda">Tienda</Link>
        <Link href="/politica-privacidad">Política de privacidad</Link>
      </p>
    </footer>
  );
}
