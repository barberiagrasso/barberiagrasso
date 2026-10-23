// Ruedecita de "cargando" para botones y pantallas de espera. Hereda el
// color del texto (currentColor), así sirve igual en un botón blanco que
// en uno negro.
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={"animate-spin " + className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
