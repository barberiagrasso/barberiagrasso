// Descarga de datos tabulares como CSV, para exportar cualquier tabla de
// los informes a Excel/Hojas de cálculo. Vive en el navegador (nada de
// "server-only" aquí): arma el CSV en memoria y dispara la descarga con
// un <a> temporal — no necesita ningún endpoint propio.
export function descargarCSV(nombreArchivo: string, filas: Record<string, string | number>[]) {
  if (filas.length === 0) return;

  const columnas = Object.keys(filas[0]);
  const escapar = (valor: string | number) => {
    const texto = String(valor);
    return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = [columnas.join(";"), ...filas.map((fila) => columnas.map((c) => escapar(fila[c])).join(";"))];

  // ";" como separador de columnas y BOM UTF-8 al principio: así Excel en
  // español (que usa "," para decimales) abre el archivo con las columnas
  // ya separadas y las tildes/eñes bien, sin tener que importar nada a mano.
  const contenido = String.fromCharCode(0xfeff) + lineas.join("\r\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
