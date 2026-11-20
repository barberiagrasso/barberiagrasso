import { redirect } from "next/navigation";

// Esta ruta era la vista previa del rediseño (hero 3D del sillón, etc.) mientras
// convivía con la home vieja en app/page.tsx. Desde el cutover a producción
// (20/11/2026) esa home nueva ES app/page.tsx, así que aquí solo queda una
// redirección a "/" por si algún enlace o marcador antiguo sigue apuntando a
// /nueva-home.
export default function NuevaHomeRedirect() {
  redirect("/");
}
