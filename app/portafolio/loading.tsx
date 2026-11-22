// Pantalla de espera inmediata (fondo oscuro de la marca) mientras llegan los datos de la página.
export default function Cargando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black" aria-busy="true" aria-label="Cargando">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-brand-white/20 border-t-brand-yellow" />
    </div>
  );
}
