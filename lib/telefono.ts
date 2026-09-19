// Una cuenta de equipo (rol "barbero") puede entrar al panel para ver la
// Agenda, gestionar clientes, cerrar citas, etc., pero Diego no quiere
// que en ningún sitio del panel pueda ver el teléfono de un cliente —
// eso queda solo para el rol "admin". Esta función centraliza esa regla
// (en vez de repetir `rol === "admin"` suelto en cada ruta o página que
// devuelve o pinta un teléfono) para que sea imposible olvidarla en un
// sitio nuevo sin que se note en el código.
//
// Sin "server-only": la usan tanto rutas de servidor (para no mandar el
// teléfono en el JSON) como algún componente de cliente que ya recibe el
// rol como prop y decide si pinta el campo.
export function puedeVerTelefonos(rol: string): boolean {
  return rol === "admin";
}

/** Devuelve el teléfono tal cual si el rol puede verlo, o `null` si no. */
export function telefonoSegunRol(telefono: string | null | undefined, rol: string): string | null {
  return puedeVerTelefonos(rol) ? telefono ?? null : null;
}
