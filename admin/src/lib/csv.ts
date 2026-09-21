/**
 * Exportación a CSV de las tablas del panel.
 *
 * Se genera en el navegador y no en el servidor: los datos ya están
 * cargados en la pantalla, así que pedirlos otra vez sólo para formatearlos
 * añadiría un endpoint, una ruta y latencia sin dar nada a cambio. Si algún
 * día hace falta exportar más filas de las que se muestran, ahí sí tendría
 * que hacerlo el servidor con paginación.
 */

/**
 * Escapa un valor para CSV.
 *
 * Las comillas se duplican y el campo se entrecomilla si contiene coma,
 * comilla o salto de línea. Sin esto, un título como `Bonnie, Clyde` partiría
 * la fila en dos columnas y desplazaría todo lo demás.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((column) => escapeCell(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(','));
  // CRLF: es lo que espera Excel; con sólo LF algunas versiones meten todo
  // en una única fila.
  return [head, ...body].join('\r\n');
}

/**
 * Descarga el CSV como archivo.
 *
 * Lleva BOM UTF-8 al principio a propósito: sin él, Excel en Windows
 * interpreta el archivo como ANSI y los acentos salen rotos ("Reguetón"
 * aparece como "ReguetÃ³n").
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();

  // Liberar el objeto: si no, el blob queda retenido en memoria hasta que
  // se recargue la página.
  URL.revokeObjectURL(url);
}

/** Nombre con fecha, para que no se pisen descargas de días distintos. */
export function datedFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
