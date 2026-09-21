/**
 * Convierte un nombre en una ruta amigable.
 *
 * Quita diacríticos a propósito (`NFKD` + descarte de marcas combinantes):
 * "Reguetón" tiene que dar "regueton" y no "regueto-n" ni un carácter
 * codificado en la URL.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
