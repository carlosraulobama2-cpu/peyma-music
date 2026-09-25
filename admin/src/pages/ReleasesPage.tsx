import { useCallback, useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { ModerationTable } from '../components/ModerationTable';
import { useReviewTrack } from '../hooks/useReviewTrack';
import { fetchPendingReleases, type PendingRelease } from '../lib/releases';

const TYPE_LABEL: Record<'EP' | 'ALBUM', string> = { EP: 'EP', ALBUM: 'Álbum' };

/**
 * EP y álbumes enteros, agrupados — a diferencia de "Moderación" (que lista
 * pista por pista), acá se ve de un vistazo qué lanzamiento es cada pista
 * pendiente y con qué créditos, para aprobar un disco completo sin tener que
 * ir a cazar sus canciones entre todo lo demás. Un sencillo no aparece: nace
 * como álbum de una sola pista y ya se revisa bien desde Moderación.
 */
export function ReleasesPage() {
  const [releases, setReleases] = useState<PendingRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pendingTrackId, approve, reject, error: actionError } = useReviewTrack();

  /**
   * Trae los lanzamientos. No toca el estado de forma SÍNCRONA: todo lo que
   * escribe va dentro de los callbacks de la promesa, lo que permite
   * llamarla desde el efecto de montaje sin provocar un render en cascada.
   */
  const cargar = useCallback(
    () =>
      fetchPendingReleases()
        .then((res) => setReleases(res.releases))
        .catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los lanzamientos.'))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const removeTrack = (albumId: string, trackId: string) => {
    setReleases((prev) =>
      prev
        .map((release) =>
          release.album.id === albumId
            ? { ...release, tracks: release.tracks.filter((t) => t.id !== trackId) }
            : release,
        )
        .filter((release) => release.tracks.length > 0),
    );
  };

  const handleApprove = async (albumId: string, trackId: string) => {
    if (await approve(trackId)) removeTrack(albumId, trackId);
  };

  const handleReject = async (albumId: string, trackId: string, reason: string) => {
    if (await reject(trackId, reason)) removeTrack(albumId, trackId);
  };

  const error = actionError ?? loadError;

  return (
    <AdminShell
      title="Lanzamientos nuevos"
      subtitle="EP y álbumes completos, esperando aprobación — agrupados por lanzamiento."
      actions={
        releases.length > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-400 ring-1 ring-inset ring-amber-500/30">
            {releases.length} lanzamiento{releases.length === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Disc3 size={20} />
          </div>
          <p className="font-semibold">Todo al día</p>
          <p className="text-sm text-muted">No hay ningún EP ni álbum esperando revisión ahora mismo.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {releases.map(({ album, tracks }) => (
            <section key={album.id} className="rounded-2xl border border-white/10 bg-surface/40 p-4">
              <header className="mb-4 flex items-center gap-4">
                <CoverImage src={album.coverUrl} alt={album.title} size={64} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-bold">{album.title}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                      {TYPE_LABEL[album.type]}
                    </span>
                  </p>
                  <p className="truncate text-sm text-muted">
                    {album.artist.name} · {tracks.length} pista{tracks.length === 1 ? '' : 's'} pendiente{tracks.length === 1 ? '' : 's'}
                  </p>
                </div>
              </header>

              <ModerationTable
                tracks={tracks}
                pendingTrackId={pendingTrackId}
                onApprove={(trackId) => handleApprove(album.id, trackId)}
                onReject={(trackId, reason) => handleReject(album.id, trackId, reason)}
              />
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
