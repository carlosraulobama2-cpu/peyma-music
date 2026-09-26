import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BadgeCheck, MoonStar } from 'lucide-react';
import {
  fetchArtists,
  setArtistBlocked,
  setArtistVerified,
  deleteArtist,
  fetchInactiveArtists,
  type AdminArtist,
  type InactiveArtist,
} from '../lib/artists';

/** "3 meses", "1 año 2 meses" — nunca días, no hace falta esa precisión para saber que alguien lleva tiempo sin publicar. */
function formatSilence(lastUploadAt: string): string {
  const months = Math.floor((Date.now() - new Date(lastUploadAt).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} año${years === 1 ? '' : 's'}` : `${years} año${years === 1 ? '' : 's'} ${rest} mes${rest === 1 ? '' : 'es'}`;
}

export function ArtistsPage() {
  // El buscador se inicializa desde la URL: los enlaces "ver artista" de
  // la cola de moderación y de tendencias llegan aquí con ?search=<nombre>,
  // y sin esto el filtro se ignoraría y caerías en la lista completa.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [inactive, setInactive] = useState<InactiveArtist[] | null>(null);
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

  useEffect(() => {
    if (!showInactive) return;
    fetchInactiveArtists()
      .then((res) => setInactive(res.artists))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los artistas inactivos.'));
  }, [showInactive]);

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

        {!showInactive && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artista"
            className="mt-6 w-full max-w-sm rounded-lg border border-white/15 bg-black/20 px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand"
          />
        )}

        {/* Filtro en cliente y no en el servidor: la lista viene entera (el
            catálogo de artistas es pequeño) y así alternar es instantáneo,
            sin un viaje extra a la API por cada clic. "Inactivos" es la
            excepción: pide su propia lista, porque no es un recorte de
            `artists` sino artistas ordenados por antigüedad de su última
            subida, algo que el catálogo cargado acá no trae. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowOnlyVerified(false);
              setShowInactive(false);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              !showOnlyVerified && !showInactive ? 'bg-white text-black' : 'bg-white/10 text-muted hover:text-foreground'
            }`}
          >
            Todos ({artists.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOnlyVerified(true);
              setShowInactive(false);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              showOnlyVerified && !showInactive ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-muted hover:text-foreground'
            }`}
          >
            <BadgeCheck size={12} aria-hidden />
            Verificados ({artists.filter((a) => a.isVerified).length})
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOnlyVerified(false);
              setShowInactive(true);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              showInactive ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-muted hover:text-foreground'
            }`}
          >
            <MoonStar size={12} aria-hidden />
            Inactivos
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {showInactive ? (
          !inactive ? (
            <div className="mt-8 flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-surface" />
              ))}
            </div>
          ) : inactive.length === 0 ? (
            <p className="mt-10 text-sm text-muted">
              Ningún artista con catálogo lleva 3 meses o más sin publicar.
            </p>
          ) : (
            <ul className="mt-8 flex flex-col gap-2">
              {inactive.map((artist) => (
                <li
                  key={artist.artistId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
                >
                  <CoverImage src={artist.imageUrl} alt={artist.name} size={44} rounded="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/artists/${artist.artistId}`}
                      className="flex items-center gap-1.5 truncate text-sm font-semibold hover:underline"
                    >
                      {artist.name}
                      {artist.isVerified && <BadgeCheck size={13} className="shrink-0 text-sky-400" aria-label="Verificado" />}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {artist.trackCount} pista{artist.trackCount === 1 ? '' : 's'} en su catálogo
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400">
                    Sin publicar hace {formatSilence(artist.lastUploadAt)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
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

                {/* Cada botón con ancho fijo: "Verificar"/"Verificado" y
                    "Bloquear"/"Desbloquear" no miden lo mismo, así que sin
                    esto la columna de acciones se corría en las filas de
                    artistas bloqueados o verificados. */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleToggleVerified(artist)}
                    disabled={busyId === artist.id}
                    title={artist.isVerified ? 'Retirar la verificación' : 'Dar el check de verificado'}
                    className={`flex w-32 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
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
                    className={`w-32 rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                      artist.isBlocked ? 'bg-brand text-black hover:bg-brand-hover' : 'border border-white/30 hover:border-white'
                    }`}
                  >
                    {artist.isBlocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    onClick={() => setPendingDelete(artist)}
                    disabled={busyId === artist.id}
                    className="w-24 rounded-full border border-danger/50 px-4 py-2 text-xs font-semibold text-danger transition-all duration-300 ease-in-out hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
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
