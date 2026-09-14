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
  { href: "/admin/profesionales", label: "Equipo" },
  { href: "/admin/bloqueos", label: "Vacaciones" },
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
    <nav className="flex flex-wrap gap-x-5 gap-y-1 font-body text-sm">
      {items.map((item) => {
        const activo = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "pb-0.5 transition-colors " +
              (activo
                ? "border-b-2 border-brand-yellow text-brand-yellow"
                : "border-b-2 border-transparent text-brand-white-dim hover:text-brand-white")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
