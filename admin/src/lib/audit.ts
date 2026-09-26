/** Etiquetas legibles. Las acciones se guardan en inglés y estables en la base. */
export const ACTION_LABELS: Record<string, string> = {
  'track.approve': 'Aprobó la pista',
  'track.reject': 'Rechazó la pista',
  'track.delete': 'Eliminó la pista',
  'artist.block': 'Bloqueó al artista',
  'artist.unblock': 'Desbloqueó al artista',
  'artist.delete': 'Eliminó al artista',
  'artist.verify': 'Verificó al artista',
  'artist.unverify': 'Retiró la verificación',
  'editorial.create': 'Creó la sección',
  'editorial.update': 'Editó la sección',
  'editorial.delete': 'Eliminó la sección',
  'editorial.items': 'Cambió el contenido de la sección',
  'user.role': 'Cambió el rol de',
  'user.impersonate': 'Entró como',
  'catalog.export': 'Exportó el catálogo',
  'setting.update': 'Cambió un ajuste',
  'genre.delete': 'Eliminó el ritmo',
};

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
