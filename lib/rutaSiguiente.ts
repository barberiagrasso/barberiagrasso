// Sin "server-only": esta función la usan tanto páginas de servidor
// (para construir la URL de redirección a /acceso o /admin/login) como
// componentes de cliente (para leer ese mismo parámetro de vuelta antes
// de usarlo en router.push) — es pura y no toca nada sensible.

/**
 * Valida que `valor` sea una ruta relativa dentro de la propia app,
 * segura para redirigir sin salir del sitio (nada de URLs absolutas ni
 * el truco "//dominio-ajeno" que el navegador trata como protocolo-
 * relativo). Si no es válida, o coincide con una de las propias
 * pantallas de acceso, devuelve `porDefecto`.
 */
export function rutaSiguienteSegura(valor: string | null | undefined, porDefecto: string): string {
  if (!valor) return porDefecto;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  if (valor === "/acceso" || valor === "/admin/login") return porDefecto;
  return valor;
}
