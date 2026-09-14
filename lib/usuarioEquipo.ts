// Sin "server-only" a propósito: lo usa tanto el servidor (al crear una
// cuenta de equipo) como el formulario de /admin/login (cliente), para
// traducir el "usuario" sencillo que escribe un barbero al email
// sintético que espera Supabase Auth por debajo — mismo patrón que
// emailSinteticoParaTelefono() en lib/clientes.ts para los clientes,
// pero en un dominio distinto para no mezclar los dos espacios.

/**
 * A partir del nombre de un profesional (tal y como está en
 * /admin/profesionales, que puede incluir una aclaración entre
 * paréntesis para desambiguar, p. ej. "Juan (Los Molinos)"), genera un
 * usuario de login corto y sin espacios ni acentos: "juan.los-molinos".
 * `sufijo` se usa para deshacer un empate (dos profesionales que
 * generarían el mismo usuario base).
 */
const CONECTORES = new Set(["de", "del", "la", "las", "el", "los", "y"]);

export function usuarioDesdeNombreProfesional(nombre: string, sufijo?: number): string {
  const sinParentesis = nombre.replace(/\(([^)]*)\)/, (_, dentro) => ` ${dentro}`);
  const palabras = sinParentesis
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((palabra) => !CONECTORES.has(palabra));
  const slug = (palabras.length > 0 ? palabras : ["equipo"]).join(".").replace(/[^a-z0-9.-]/g, "");
  return sufijo ? `${slug}.${sufijo}` : slug;
}

/**
 * Email sintético y determinista a partir de un "usuario" de equipo ya
 * normalizado (minúsculas). Nunca se manda nada a esta dirección; es
 * solo el identificador que necesita Supabase Auth por debajo.
 */
export function emailSinteticoParaUsuarioEquipo(usuario: string): string {
  return `${usuario}@equipo.barberiagrasso.internal`;
}
