/**
 * Formateador de números compartido por la web — mismo criterio que
 * `formatNumber` en `src/utils/index.ts` de la app móvil.
 *
 * Antes cada pantalla tenía el suyo y no coincidían entre sí ni con la app:
 * la misma cifra de reproducciones leía "1,2K" en el teléfono, "1,2 mil" en
 * la lista de canciones de la web y "1.234" (sin abreviar) en la landing.
 */

/** 1250000 → `1,25M`. Usa separador decimal español. */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return "0";
  const abs = Math.abs(num);
  const withComma = (value: number, digits: number) => value.toFixed(digits).replace(".", ",").replace(/,0+$/, "");

  if (abs >= 1_000_000_000) return `${withComma(num / 1_000_000_000, 2)}MM`;
  if (abs >= 1_000_000) return `${withComma(num / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${withComma(num / 1_000, 1)}K`;
  return Math.round(num).toString();
}
