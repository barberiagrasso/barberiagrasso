// Formateo compartido de valores monetarios, usado tanto en Informes
// como en Comisiones (y cualquier otra pantalla que necesite mostrar un
// importe en céntimos como euros con formato español). Vive fuera de
// "server-only": lo importan tanto rutas de servidor como componentes
// "use client".
export function euros(centimos: number): string {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}
