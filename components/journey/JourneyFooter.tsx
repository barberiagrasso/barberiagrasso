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

      {/* Acceso del equipo, siempre visible en el pie (pedido de Diego,
          09/11/2026): para que el administrador pueda entrar al panel desde
          casi cualquier página, sin tener que escribir la URL a mano.
          Deliberadamente discreto — no es para clientes. */}
      <p className="mt-4 font-body text-[11px] text-brand-white-dim/40">
        <Link href="/admin/login" className="underline decoration-brand-line underline-offset-4 hover:text-brand-yellow">
          Acceso de administrador
        </Link>
      </p>
    </footer>
  );
}
