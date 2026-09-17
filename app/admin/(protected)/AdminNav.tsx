"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Estas 4 secciones son solo para rol "admin" (ver requireRolAdmin en
// lib/adminAuth.ts) — una cuenta de equipo (rol "barbero") ni las ve en
// el menú ni puede entrar a la URL directamente.
const SOLO_ADMIN = new Set(["/admin/profesionales", "/admin/campanas", "/admin/plantillas", "/admin/informes"]);

const NAV = [
  { href: "/admin/dashboard", label: "Agenda" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/profesionales", label: "Equipo" },
  { href: "/admin/comisiones", label: "Comisiones" },
  { href: "/admin/vacaciones", label: "Vacaciones" },
  { href: "/admin/campanas", label: "Campañas" },
  { href: "/admin/plantillas", label: "Plantillas" },
  { href: "/admin/informes", label: "Informes" },
  { href: "/admin/conversaciones", label: "WhatsApp" },
  { href: "/admin/errores", label: "Errores" },
];

export default function AdminNav({ rol }: { rol: string }) {
  const pathname = usePathname();
  const items = rol === "admin" ? NAV : NAV.filter((item) => !SOLO_ADMIN.has(item.href));

  return (
    // overflow-x-auto en vez de flex-wrap: con 10 secciones, envolver el
    // menú en varias líneas dentro de la cabecera quedaba desordenado
    // (y en el rol "admin" empujaba el resto de la cabecera). Ahora es
    // una sola tira que se desplaza en horizontal si no cabe — el patrón
    // habitual de pestañas en paneles (GitHub, Linear, Stripe...).
    <nav className="flex gap-1 overflow-x-auto font-body text-sm">
      {items.map((item) => {
        const activo = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-3 transition-colors " +
              (activo
                ? "border-brand-yellow bg-brand-yellow/10 font-semibold text-brand-yellow"
                : "border-transparent text-brand-white-dim hover:bg-white/[0.06] hover:text-brand-white")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
