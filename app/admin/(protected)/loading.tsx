// Se ve al instante al cambiar de pantalla en el panel, mientras llegan los datos: así el toque
// "responde" aunque la pantalla nueva tarde un momento.
export default function CargandoPanel() {
  return (
    <div className="space-y-4 py-6" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-black/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/[0.07]" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/[0.07]" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/[0.07]" />
    </div>
  );
}
