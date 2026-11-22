// Productos de la tienda con foto (22/11/2026). Se enseñan siempre en /tienda, además de los que
// se den de alta en el panel. Viven en public/media/tienda. Todavía sin precio: en la tienda sale
// "Precio en la barbería" hasta que David pase los precios (pon aquí precio_centimos y listo).
export interface ProductoFijo {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  precio_centimos: number | null;
  coste_grassocoins: number | null;
  foto_url: string;
  orden: number;
}

const p = (id: string, nombre: string, categoria: string, descripcion: string, orden: number): ProductoFijo => ({
  id: `fijo-${id}`,
  nombre,
  categoria,
  descripcion,
  precio_centimos: null,
  coste_grassocoins: null,
  foto_url: `/media/tienda/${id}.jpg`,
  orden: 1000 + orden,
});

export const PRODUCTOS_FIJOS: ProductoFijo[] = [
  p("champu-anti-amarillo", "Champú anti-amarillo Be'Shyne", "Cuidado del cabello", "Elimina los tonos amarillos. Para cabellos rubios, grises o decolorados.", 1),
  p("champu-rapunzel", "Champú Rapunzel potenciador Be'Shyne", "Cuidado del cabello", "Ayuda a estimular el crecimiento natural del cabello. Uso profesional.", 2),
  p("mascarilla-rizos", "Mascarilla Rizos Curls Be'Shyne", "Cuidado del cabello", "Hidrata, nutre y revitaliza el cabello rizado. Sin sulfatos.", 3),
  p("activador-rizos", "Activador de rizos Be'Shyne", "Cuidado del cabello", "Leave-in que define el cabello rizado y le devuelve elasticidad y flexibilidad.", 4),
  p("fibras-capilares", "Fibras capilares Impala (negro / marrón oscuro)", "Cuidado del cabello", "Volumen instantáneo con fibras de queratina. 50 g.", 5),
  p("barber-cologne", "Barber Cologne Impala (Marmaris / Alacati)", "Colonias y after shave", "Colonia profesional de barbero en spray. 400 ml.", 6),
  p("cream-cologne", "Cream Cologne Impala (Fresh / Sport)", "Colonias y after shave", "Crema colonia after shave para un rostro fresco. 400 ml.", 7),
  p("ceras-impala", "Ceras Impala (Light, Matte, Purple, Extra Strong)", "Peinado y fijación", "Aqua wax, clay wax y paste wax en distintas fijaciones y acabados.", 8),
  p("laca-beton", "Laca Beton Immortal Infuse Mega Strong", "Peinado y fijación", "Laca de fijación ultra fuerte con queratina vegetal.", 9),
  p("mousse-gummy", "Espuma Gummy Keratin Hair Mousse", "Peinado y fijación", "Volumen y fijación extra fuerte con queratina. 225 ml.", 10),
];
