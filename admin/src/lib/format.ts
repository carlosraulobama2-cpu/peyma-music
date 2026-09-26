/**
 * Formateadores de duración compartidos por el panel.
 *
 * Antes cada pantalla tenía su propia copia de `formatDuration` (algunas
 * sin `Math.floor` en los segundos, así que un valor no entero rendía
 * "3:13.7" en vez de "3:13") y dos fórmulas distintas de "horas totales"
 * que podían dar resultados diferentes para el mismo dato — ver
 * `formatHours` de acá vs la vieja `formatTotal` de `PlaylistDetailPage`.
 */

/** "m:ss", igual en cualquier pantalla del panel. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "12 h 34 min" o "34 min" — redondea los minutos totales primero, no por separado. */
export function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
