"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Estas secciones son solo para rol "admin" (ver requireRolAdmin en
// lib/adminAuth.ts) — una cuenta de equipo (rol "barbero") ni las ve en
// el menú ni puede entrar a la URL directamente. "Mi barbería" sí la ven
// los dos roles: dentro, su propia pestaña "Equipo" es la que se oculta
// para un barbero (ver MiBarberiaClient.tsx).
const SOLO_ADMIN = new Set(["/admin/campanas", "/admin/plantillas", "/admin/informes"]);

// Menú más corto que antes (pedido de Diego): Servicios, Productos y
// Equipo se agruparon en una sola pestaña ("Mi barbería", con sus
// propias pestañas internas — ver mi-barberia/MiBarberiaClient.tsx).
// Lista de espera pasó a ser una pestaña dentro de la propia Agenda
// (AgendaClient.tsx) en vez de una sección aparte, y WhatsApp pasó a ser
// la burbuja flotante de todo el panel (WhatsAppFlotante.tsx) en vez de
// una pestaña — las rutas /admin/servicios, /admin/productos,
// /admin/profesionales, /admin/lista-espera y /admin/conversaciones
// siguen existiendo por si hay algún enlace guardado, solo que ya no
// aparecen aquí.
const NAV = [
  { href: "/admin/dashboard", label: "Agenda" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/mi-barberia", label: "Mi barbería" },
  { href: "/admin/comisiones", label: "Comisiones" },
  { href: "/admin/vacaciones", label: "Vacaciones" },
  { href: "/admin/campanas", label: "Campañas" },
  { href: "/admin/plantillas", label: "Plantillas" },
  { href: "/admin/informes", label: "Informes" },
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
