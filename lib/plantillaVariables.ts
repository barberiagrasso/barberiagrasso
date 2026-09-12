import "server-only";

/**
 * Traduce los nombres de variables que Diego escribió al registrar una
 * plantilla (p. ej. "nombre, mensaje" o "nombre, servicio, hora, sede")
 * a sus valores reales para un envío concreto, en el mismo orden en que
 * aparecen en la plantilla de Meta ({{1}}, {{2}}...). Si escribe un
 * nombre que no reconocemos, se manda vacío en vez de romper el envío.
 */
export function resolverVariablesPlantilla(nombresVariables: string[], contexto: Record<string, string>): string[] {
  return nombresVariables.map((nombre) => contexto[nombre.trim().toLowerCase()] ?? "");
}
