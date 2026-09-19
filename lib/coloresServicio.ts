// Paleta fija de colores para servicios (leyenda de la Agenda): sin
// "server-only" porque la usa tanto el selector de color del panel
// (cliente) como la ruta que crea un servicio nuevo (servidor), para que
// las dos partes hablen siempre de los mismos colores. Los valores hex
// coinciden con los que ya se usaron para rellenar los servicios
// existentes en supabase/anadir-color-servicios-y-eleccion-barbero.sql.
export const PALETA_COLORES_SERVICIO: { nombre: string; valor: string }[] = [
  { nombre: "Ámbar", valor: "#f59e0b" },
  { nombre: "Azul", valor: "#0ea5e9" },
  { nombre: "Morado", valor: "#8b5cf6" },
  { nombre: "Verde", valor: "#10b981" },
  { nombre: "Rojo", valor: "#ef4444" },
  { nombre: "Rosa", valor: "#ec4899" },
  { nombre: "Turquesa", valor: "#14b8a6" },
  { nombre: "Índigo", valor: "#6366f1" },
];

export const COLOR_SERVICIO_POR_DEFECTO = PALETA_COLORES_SERVICIO[0].valor;

/** Color por rotación para el servicio nº `posicion` (0, 1, 2…) que se da de alta. */
export function colorPorRotacion(posicion: number): string {
  const paleta = PALETA_COLORES_SERVICIO;
  return paleta[((posicion % paleta.length) + paleta.length) % paleta.length].valor;
}
