// Catálogo de estilos de Barbería Grasso, compartido por el asesor de
// estilo con IA (servidor) y las pantallas (cliente y panel). Sin "server-only".

// Catálogo de estilos y servicios de Barbería Grasso (cartel "¿Qué estilo
// llevas hoy?"). La IA recomienda SOLO de aquí, con estos mismos nombres,
// para que el cliente pida algo que el barbero reconoce.
export const CATALOGO_CORTES = [
  "Clásico",
  "Degradado alto",
  "Degradado medio",
  "Degradado bajo",
  "Raya a navaja",
  "Falso mohicano",
  "Rapado",
  "Undercut",
  "Flequillo corto",
  "Old money",
  "Old money con degradado suave",
  "Tupé a tijera",
  "Mohicano",
  "Mullet",
  "Rizado (definido arriba)",
  "Rizado con degradado",
  "Degradado y arriba al 2",
  "Afro clásico",
  "Afro con esponja",
];
export const CATALOGO_BARBAS = ["Barba italiana", "Barba corta", "Barba clásica", "Barba degradada", "Barba larga", "Afeitado"];
export const CATALOGO_DETALLES = ["Diseño o raya con navaja (detalles a medida)"];
export const CATALOGO_EXTRAS = [
  "Depilación de nariz y orejas con cera",
  "Limpieza facial",
  "Hidratación capilar",
  "Alisado (brasileño o botox)",
  "Rubio platino",
  "Perfilado de cejas",
  "Mechas",
  "Camuflaje de canas",
];

// Precio orientativo que se enseña al cliente junto al extra sugerido
// (los que David ha dado; el resto se consulta en la barbería).
export const PRECIO_EXTRAS: Record<string, string> = {
  "Alisado (brasileño o botox)": "de 19 € a 30 €",
  Mechas: "44,99 €",
  "Rubio platino": "69,90 €",
};

// Foto de ejemplo de cada estilo (recortes del cartel de Grasso, en
// public/media/estilos) para enseñarla junto a la recomendación.
export const FOTO_ESTILO: Record<string, string> = {
  "Clásico": "clasico",
  "Degradado alto": "degradado-alto",
  "Degradado medio": "degradado-medio",
  "Degradado bajo": "degradado-bajo",
  "Raya a navaja": "raya-a-navaja",
  "Falso mohicano": "falso-mohicano",
  Rapado: "rapado",
  Undercut: "undercut",
  "Flequillo corto": "flequillo-corto",
  "Old money": "old-money",
  "Old money con degradado suave": "old-money-degradado-suave",
  "Tupé a tijera": "tupe-a-tijera",
  Mohicano: "mohicano",
  Mullet: "mullet",
  "Rizado (definido arriba)": "rizado-01",
  "Rizado con degradado": "rizado-02",
  "Degradado y arriba al 2": "degradado-y-arriba-al-2",
  "Afro clásico": "afro-clasico",
  "Afro con esponja": "afro-con-esponja",
  "Barba italiana": "barba-italiana",
  "Barba corta": "barba-corta",
  "Barba clásica": "barba-clasica",
  "Barba degradada": "barba-degradada",
  "Barba larga": "barba-larga",
};

export function fotoDeEstilo(nombre: string): string | null {
  const archivo = FOTO_ESTILO[nombre];
  return archivo ? `/media/estilos/${archivo}.jpg` : null;
}
