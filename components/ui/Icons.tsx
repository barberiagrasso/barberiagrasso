// Set mínimo de iconos de línea (estilo UI genérico, sin depender de
// ninguna librería externa) — para sustituir los emojis del panel de
// admin por algo con pinta de producto de verdad. Todos comparten las
// mismas props que un <svg>: se colorean con `className="text-…"` (usan
// currentColor) y se dimensionan con `className="h-4 w-4"` etc.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconScissors(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="6" r="2.25" />
      <circle cx="6" cy="18" r="2.25" />
      <path d="M8.5 7.5 19.5 18M8.5 16.5 19.5 6" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4 3.5-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.2" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconBag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 8h11l-1 12.5h-9L6.5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

export function IconCard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconCoin(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15 8.7a4 4 0 1 0 0 6.6M8.2 11h5M8.2 13.3h4" />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16.8 3.9a2.1 2.1 0 0 1 3 3L8.4 18.3l-4.2 1 1-4.2L16.8 3.9Z" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12.5 10 17.5 19.5 7" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5Z" />
      <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" strokeWidth={2.5} />
    </svg>
  );
}

export function IconBanknote(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.25" />
      <path d="M6 9.5v.01M18 14.5v.01" strokeWidth={2.5} />
    </svg>
  );
}

export function IconSmartphone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.2h2" />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg {...base} {...props} strokeWidth={2.5}>
      <path d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}

export function IconTicket(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.2a1.8 1.8 0 0 0 0 3.6V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.2a1.8 1.8 0 0 0 0-3.6Z" />
      <path d="M14 7.5v9" strokeDasharray="2.2 2.2" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5c0-.8.6-1.5 1.5-1.5H9l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v2.5c0 .8-.7 1.5-1.5 1.5C10.6 21.5 2.5 13.4 2.5 6.5 2.5 5.7 2.6 5 5 4.5Z" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 1 1 3.2 6.4L4 19.5l1.1-3.3A7.96 7.96 0 0 1 4 12Z" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8.5 14l2 2 4-4" />
    </svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12 20 4l-6 16-3-6-6-2Z" />
    </svg>
  );
}

// Destello/estrella — usado en la pantalla "¿Qué deseas?" de
// app/reservar (asistente de reserva por IA, ver
// components/reservar/AsistenteReserva.tsx) para diferenciarla del resto
// de iconos "de barbería".
export function IconSparkle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M18.5 5.5l-2.8 2.8M8.3 15.7l-2.8 2.8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
