import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BadgeCheck } from 'lucide-react';
import { fetchArtists, setArtistBlocked, setArtistVerified, deleteArtist, type AdminArtist } from '../lib/artists';

export function ArtistsPage() {
  // El buscador se inicializa desde la URL: los enlaces "ver artista" de
  // la cola de moderación y de tendencias llegan aquí con ?search=<nombre>,
  // y sin esto el filtro se ignoraría y caerías en la lista completa.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminArtist | null>(null);

  const load = useCallback((term: string) => {
    setLoading(true);
    setError(null);
    fetchArtists(term)
      .then((res) => setArtists(res.artists))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los artistas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // La URL refleja el filtro para que se pueda compartir o recargar sin
    // perderlo. `replace` para no llenar el historial con cada tecla.
    setSearchParams(search.trim() ? { search: search.trim() } : {}, { replace: true });
  }, [search, setSearchParams]);

  useEffect(() => {
    // Debounce: cada tecla no debe disparar una consulta al catálogo.
    const timer = setTimeout(() => load(search), 250);
    return () => clearTimeout(timer);
  }, [search, load]);

  const handleToggleBlock = async (artist: AdminArtist) => {
    setBusyId(artist.id);
    setError(null);
    try {
      const { artist: updated } = await setArtistBlocked(artist.id, !artist.isBlocked);
      setArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el bloqueo.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Da o retira el check. Se manda el estado OBJETIVO y no un "alterna":
   * si dos pestañas actúan a la vez, un alternador puede dejar al artista
   * en el estado contrario al que el admin quería.
   */
  const handleToggleVerified = async (artist: AdminArtist) => {
    setBusyId(artist.id);
    setError(null);
    try {
      await setArtistVerified(artist.id, !artist.isVerified);
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la verificación.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (artist: AdminArtist) => {
    setBusyId(artist.id);
    setError(null);
    try {
      await deleteArtist(artist.id);
      setArtists((prev) => prev.filter((a) => a.id !== artist.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el artista.');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  };

  const visibleArtists = showOnlyVerified ? artists.filter((artist) => artist.isVerified) : artists;

  return (
    <AdminShell
      title="Artistas"
      subtitle='Bloquear oculta al artista y todas sus pistas, pero es reversible. Eliminar destruye sus álbumes y canciones.'
    >

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar artista"
          className="mt-6 w-full max-w-sm rounded-lg border border-white/15 bg-black/20 px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand"
        />

        {/* Filtro en cliente y no en el servidor: la lista viene entera (el
            catálogo de artistas es pequeño) y así alternar es instantáneo,
            sin un viaje extra a la API por cada clic. */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowOnlyVerified(false)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              showOnlyVerified ? 'bg-white/10 text-muted hover:text-foreground' : 'bg-white text-black'
            }`}
          >
            Todos ({artists.length})
          </button>
          <button
            type="button"
            onClick={() => setShowOnlyVerified(true)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              showOnlyVerified ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-muted hover:text-foreground'
            }`}
          >
            <BadgeCheck size={12} aria-hidden />
            Verificados ({artists.filter((a) => a.isVerified).length})
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-8 flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-surface" />
            ))}
          </div>
        ) : visibleArtists.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No hay artistas que coincidan.</p>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {visibleArtists.map((artist) => (
              <li
                key={artist.id}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-300 ${
                  artist.isBlocked ? 'border-danger/30 bg-danger/5' : 'border-white/10 bg-surface hover:bg-white/5'
                }`}
              >
                {/* La foto y el nombre llevan a la ficha. Enlace y no botón:
                    así se puede abrir en otra pestaña, que es lo que hace
                    falta para comparar dos artistas. Los botones de acción
                    quedan fuera del enlace — un enlace dentro de otro, o un
                    botón dentro de un enlace, es HTML inválido. */}
                <Link to={`/artists/${artist.id}`} className="shrink-0" aria-label={`Abrir la ficha de ${artist.name}`}>
                  <CoverImage src={artist.imageUrl} alt={artist.name} size={56} rounded="rounded-full" />
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold">
                    <Link to={`/artists/${artist.id}`} className="truncate hover:underline">
                      {artist.name}
                    </Link>
                    {artist.isVerified && (
                      <BadgeCheck size={16} className="shrink-0 text-sky-400" aria-label="Artista verificado" />
                    )}
                    {artist.isBlocked && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger ring-1 ring-inset ring-danger/30">
                        Bloqueado
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {artist._count.tracks} pista{artist._count.tracks === 1 ? '' : 's'} · {artist._count.albums} álbum
                    {artist._count.albums === 1 ? '' : 'es'} · {artist._count.followers} seguidor
                    {artist._count.followers === 1 ? '' : 'es'}
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleToggleVerified(artist)}
                    disabled={busyId === artist.id}
                    title={artist.isVerified ? 'Retirar la verificación' : 'Dar el check de verificado'}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                      artist.isVerified
                        ? 'bg-sky-500/20 text-sky-300 ring-1 ring-inset ring-sky-400/40'
                        : 'border border-white/30 hover:border-white'
                    }`}
                  >
                    <BadgeCheck size={13} aria-hidden />
                    {artist.isVerified ? 'Verificado' : 'Verificar'}
                  </button>
                  <button
                    onClick={() => handleToggleBlock(artist)}
                    disabled={busyId === artist.id}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                      artist.isBlocked ? 'bg-brand text-black hover:bg-brand-hover' : 'border border-white/30 hover:border-white'
                    }`}
                  >
                    {artist.isBlocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    onClick={() => setPendingDelete(artist)}
                    disabled={busyId === artist.id}
                    className="rounded-full border border-danger/50 px-4 py-2 text-xs font-semibold text-danger transition-all duration-300 ease-in-out hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar a ${pendingDelete.name}`}
          // Se dice exactamente cuánto se destruye: borrar un artista arrastra
          // sus álbumes y pistas por cascada, y eso no se puede deshacer.
          message={`Se eliminarán también sus ${pendingDelete._count.albums} álbum(es) y ${pendingDelete._count.tracks} pista(s). Esta acción no se puede deshacer — si sólo querés ocultarlo, usá "Bloquear".`}
          confirmLabel="Eliminar definitivamente"
          isSubmitting={busyId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}
    </AdminShell>
  );
}
