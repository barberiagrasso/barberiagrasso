"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Estas secciones son solo para rol "admin" (ver requireRolAdmin en
// lib/adminAuth.ts) — una cuenta de equipo (rol "barbero") ni las ve en
// el menú ni puede entrar a la URL directamente. "Mi barbería" sí la ven
// los dos roles: dentro, su propia pestaña "Equipo" es la que se oculta
// para un barbero (ver MiBarberiaClient.tsx).
// Clientes, Mi barbería (servicios, productos, bonos, equipo, sedes y
// portafolio) y Errores del sistema también son solo del dueño (pedido de
// Diego, 27/10/2026): los barberos no editan precios ni ven la cartera de
// clientes.
const SOLO_ADMIN = new Set([
  "/admin/campanas",
  "/admin/plantillas",
  "/admin/informes",
  "/admin/bloqueos",
  "/admin/auditoria",
  "/admin/clientes",
  "/admin/mi-barberia",
  "/admin/errores",
  "/admin/rendimiento",
  "/admin/pendientes",
]);

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
// Menú agrupado por áreas, al estilo de Booksy (pedido de David,
// 19/11/2026): pocas pestañas arriba y, dentro de cada área, una segunda
// tira con sus secciones. Cada sección vive en un único sitio.
const GRUPOS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "Agenda", items: [
    { href: "/admin/dashboard", label: "Agenda" },
    { href: "/admin/bloqueos", label: "Cierres" },
  ] },
  { label: "Clientes", items: [
    { href: "/admin/clientes", label: "Clientes" },
    { href: "/admin/opiniones", label: "Opiniones" },
  ] },
  { label: "Personal", items: [
    { href: "/admin/personal", label: "Personal" },
    { href: "/admin/asesor", label: "Asesor" },
    { href: "/admin/vacaciones", label: "Vacaciones" },
  ] },
  { label: "Finanzas", items: [
    { href: "/admin/caja", label: "Caja" },
    { href: "/admin/rendimiento", label: "Rendimiento" },
    { href: "/admin/comisiones", label: "Comisiones" },
    { href: "/admin/informes", label: "Informes" },
    { href: "/admin/stock", label: "Stock" },
  ] },
  { label: "Marketing", items: [
    { href: "/admin/campanas", label: "Campañas" },
    { href: "/admin/plantillas", label: "Plantillas" },
  ] },
  { label: "Ajustes", items: [
    { href: "/admin/mi-barberia", label: "Mi barbería" },
    { href: "/admin/auditoria", label: "Auditoría" },
    { href: "/admin/errores", label: "Errores" },
    { href: "/admin/pendientes", label: "Pendientes" },
  ] },
];

// Iconos sencillos (trazo) para la barra lateral, al estilo Booksy.
const ICONOS: Record<string, string> = {
  Agenda: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  Clientes: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a3 3 0 0 0-2-2.8M4 19v-1a3 3 0 0 1 2-2.8",
  Personal: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  Finanzas: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  Marketing: "M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6",
  Ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 9h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 2z",
};

const claseTab = (activo: boolean) =>
  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 transition-colors " +
  (activo
    ? "bg-brand-yellow font-semibold text-brand-yellow-ink"
    : "text-brand-white-dim hover:bg-white/[0.08] hover:text-brand-white");

export default function AdminNav({ rol, encargadoStock = false }: { rol: string; encargadoStock?: boolean }) {
  const pathname = usePathname();
  const visible = (href: string) =>
    (rol === "admin" || !SOLO_ADMIN.has(href)) && (href !== "/admin/stock" || rol === "admin" || encargadoStock);
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => visible(i.href)) })).filter((g) => g.items.length > 0);
  const actual = grupos.find((g) => g.items.some((i) => pathname?.startsWith(i.href)));

  return (
    <div className="flex flex-col gap-2">
      {/* Ordenador/tablet: barra lateral fija a la izquierda, como Booksy. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center gap-1 border-r border-white/[0.06] bg-brand-black pt-20 md:flex print:hidden">
        {grupos.map((g) => {
          const activo = g === actual;
          return (
            <Link
              key={g.label}
              href={g.items[0].href}
              title={g.label}
              className={
                "flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 font-body text-[11px] transition-colors " +
                (activo ? "bg-brand-yellow font-semibold text-brand-yellow-ink" : "text-brand-white-dim hover:bg-white/[0.08] hover:text-brand-white")
              }
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONOS[g.label]} />
              </svg>
              {g.label}
            </Link>
          );
        })}
      </aside>
      {/* Móvil: la misma lista de áreas en una tira arriba. */}
      <nav className="flex gap-1 overflow-x-auto rounded-full bg-white/[0.06] p-1 font-body text-sm md:hidden">
        {grupos.map((g) => (
          <Link key={g.label} href={g.items[0].href} className={claseTab(g === actual)}>
            {g.label}
          </Link>
        ))}
      </nav>
      {actual && actual.items.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto px-1 py-1 font-body text-xs md:text-sm">
          {actual.items.map((item) => {
            const activo = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 transition-colors " +
                  (activo
                    ? "border-brand-yellow text-brand-yellow"
                    : "border-white/10 text-brand-white-dim hover:text-brand-white")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
