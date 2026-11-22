// Trabajos de Barbería Grasso que se enseñan siempre en "Nuestros
// trabajos" (fotos con fondo gris enviadas por David, 18/11/2026), además de las que se
// suban desde el panel (Mi barbería → Portafolio). Viven en
// public/media/portafolio. Para quitar una, bórrala de aquí y del archivo.
import type { FotoPortafolio } from "@/lib/portafolio";

export const FOTOS_PORTAFOLIO_FIJAS: FotoPortafolio[] = [
  { id: "grasso-01", url: "/media/portafolio/01-barba-larga.jpg", servicio_id: null, sede_id: null, descripcion: "Barba larga", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-02", url: "/media/portafolio/02-mullet-degradado-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet con degradado y barba perfilada", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-03", url: "/media/portafolio/03-peinado-atras-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Peinado hacia atrás con degradado y barba", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-04", url: "/media/portafolio/04-rizos-degradado.jpg", servicio_id: null, sede_id: null, descripcion: "Rizos con degradado", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-05", url: "/media/portafolio/05-corto-degradado-alto.jpg", servicio_id: null, sede_id: null, descripcion: "Corte corto con degradado alto", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-06", url: "/media/portafolio/06-diseno-navaja-degradado.jpg", servicio_id: null, sede_id: null, descripcion: "Diseño a navaja con degradado", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-07", url: "/media/portafolio/07-afro-natural-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Afro natural con barba", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-08", url: "/media/portafolio/08-clasico-canas.jpg", servicio_id: null, sede_id: null, descripcion: "Clásico peinado hacia atrás", created_at: "2026-11-18T00:00:00Z" },
  { id: "grasso-09", url: "/media/portafolio/09-mullet-rizado-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet rizado con barba", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-10", url: "/media/portafolio/10-color-diseno.jpg", servicio_id: null, sede_id: null, descripcion: "Color fantasía con diseño", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-11", url: "/media/portafolio/11-texturizado-degradado.jpg", servicio_id: null, sede_id: null, descripcion: "Texturizado con degradado bajo", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-12", url: "/media/portafolio/12-platino-raya.jpg", servicio_id: null, sede_id: null, descripcion: "Platino con raya marcada", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-13", url: "/media/portafolio/13-mullet-hacia-atras.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet peinado hacia atrás", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-14", url: "/media/portafolio/14-mullet-degradado.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet con degradado", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-15", url: "/media/portafolio/15-crop-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Crop y barba", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-16", url: "/media/portafolio/16-crop-degradado-alto.jpg", servicio_id: null, sede_id: null, descripcion: "Crop con degradado alto", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-17", url: "/media/portafolio/17-degradado-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Degradado bajo con barba", created_at: "2026-11-19T00:00:00Z" },
  { id: "grasso-18", url: "/media/portafolio/18-degradado-barba-cobriza.jpg", servicio_id: null, sede_id: null, descripcion: "Degradado bajo con barba cobriza", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-19", url: "/media/portafolio/19-crop-degradado-skin.jpg", servicio_id: null, sede_id: null, descripcion: "Crop con degradado a cero", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-20", url: "/media/portafolio/20-crop-flequillo-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Crop con flequillo y barba", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-21", url: "/media/portafolio/21-mullet-rubio.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet con mechas rubias", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-22", url: "/media/portafolio/22-mullet-engominado.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet engominado hacia atrás", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-23", url: "/media/portafolio/23-platino-corte-lateral.jpg", servicio_id: null, sede_id: null, descripcion: "Platino con raya y degradado", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-24", url: "/media/portafolio/24-flequillo-texturizado.jpg", servicio_id: null, sede_id: null, descripcion: "Flequillo texturizado con degradado", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-25", url: "/media/portafolio/25-rapado-color-diseno.jpg", servicio_id: null, sede_id: null, descripcion: "Rapado con color y diseño", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-26", url: "/media/portafolio/26-mullet-rizado-perfilado.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet rizado con barba perfilada", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-27", url: "/media/portafolio/27-infantil-diseno-lateral.jpg", servicio_id: null, sede_id: null, descripcion: "Corte infantil con diseño", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-28", url: "/media/portafolio/28-infantil-diseno-frente.jpg", servicio_id: null, sede_id: null, descripcion: "Corte infantil con diseño y degradado", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-29", url: "/media/portafolio/29-calvo-barba-larga.jpg", servicio_id: null, sede_id: null, descripcion: "Cabeza rapada y barba larga", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-30", url: "/media/portafolio/30-clasico-barba-corta.jpg", servicio_id: null, sede_id: null, descripcion: "Clásico peinado atrás y barba corta", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-31", url: "/media/portafolio/31-mullet-degradado-perfil.jpg", servicio_id: null, sede_id: null, descripcion: "Mullet con degradado y barba", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-32", url: "/media/portafolio/32-rizado-flequillo.jpg", servicio_id: null, sede_id: null, descripcion: "Rizado con flequillo y degradado", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-33", url: "/media/portafolio/33-militar-degradado.jpg", servicio_id: null, sede_id: null, descripcion: "Corte militar con degradado", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-34", url: "/media/portafolio/34-rizado-raya-barba.jpg", servicio_id: null, sede_id: null, descripcion: "Rizado con raya y barba", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-35", url: "/media/portafolio/35-afro-sonrisa.jpg", servicio_id: null, sede_id: null, descripcion: "Afro natural con barba", created_at: "2026-11-22T00:00:00Z" },
  { id: "grasso-36", url: "/media/portafolio/36-clasico-canas-gafas.jpg", servicio_id: null, sede_id: null, descripcion: "Clásico con canas", created_at: "2026-11-22T00:00:00Z" },
];
