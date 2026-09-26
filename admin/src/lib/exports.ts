import { http } from './httpClient';

/**
 * Exportación completa del catálogo — a diferencia de los botones "Exportar
 * CSV" que ya tienen Usuarios y Tendencias (que sólo exportan lo que ya
 * está cargado en pantalla), esto pide TODO al servidor, hasta 20 000 filas
 * (ver EXPORT_HARD_CAP en el backend).
 */
export type ExportKind = 'tracks' | 'artists' | 'users';

export function fetchExport(kind: ExportKind): Promise<{ rows: Record<string, unknown>[] }> {
  return http.get(`/admin/export/${kind}`);
}
