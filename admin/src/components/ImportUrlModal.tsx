import { useEffect, useRef, useState } from 'react';
import { Link2, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CoverImage } from './CoverImage';
import {
  inspectImportUrl,
  confirmImport,
  fetchArtists,
  type ExtractedTrack,
  type AdminArtist,
} from '../lib/artists';
import { formatDuration } from '../lib/format';

/**
 * Importar una canción desde una URL.
 *
 * Dos pasos, y no uno: primero se extrae y se enseña lo encontrado, después
 * el administrador corrige y publica. Los metadatos incrustados en un
 * archivo casi nunca vienen limpios — el artista dentro del título, el álbum
 * vacío, acentos rotos — y publicar a ciegas llenaría el catálogo de
 * entradas que luego hay que arreglar a mano.
 *
 * Sólo acepta enlaces directos a un archivo de audio, o páginas que declaren
 * uno en `og:audio`. El backend rechaza YouTube, SoundCloud y equivalentes.
 */

interface ImportUrlModalProps {
  onClose: () => void;
  /** Se llama al publicar, para que la pantalla de debajo se refresque. */
  onImported: () => void;
}

/** De dónde salieron los metadatos, para que el revisor sepa de qué fiarse. */
const SOURCE_LABEL: Record<ExtractedTrack['metadataSource'], string> = {
  id3: 'etiquetas del archivo',
  opengraph: 'metadatos de la página',
  filename: 'nombre del archivo',
};

export function ImportUrlModal({ onClose, onImported }: ImportUrlModalProps) {
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractedTrack | null>(null);
  const [artists, setArtists] = useState<AdminArtist[]>([]);

  // Borradores editables. Arrancan con lo extraído y el revisor los corrige.
  const [title, setTitle] = useState('');
  const [artistId, setArtistId] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArtists()
      .then((res) => setArtists(res.artists))
      .catch(() => setError('No se pudieron cargar los artistas.'));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const extract = async () => {
    if (!url.trim()) return;
    setExtracting(true);
    setError(null);
    setExtracted(null);
    try {
      const { extracted: result } = await inspectImportUrl(url.trim());
      setExtracted(result);
      setTitle(result.title);
      // Si el nombre extraído coincide con un artista del catálogo se
      // preselecciona; si no, el revisor elige. Nunca se crea un artista
      // solo: eso llenaría la base de duplicados con erratas.
      const match = artists.find(
        (a) => a.name.toLowerCase() === (result.artistName ?? '').toLowerCase(),
      );
      setArtistId(match?.id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo extraer la canción.');
    } finally {
      setExtracting(false);
    }
  };

  const publish = async () => {
    if (!extracted || !artistId || !rightsConfirmed) return;
    setPublishing(true);
    setError(null);
    try {
      await confirmImport({
        importId: extracted.importId,
        audioUrl: extracted.audioUrl,
        ...(extracted.coverUrl ? { coverUrl: extracted.coverUrl } : {}),
        title: title.trim(),
        artistId,
        durationSeconds: extracted.durationSeconds,
        sourceUrl: extracted.sourceUrl,
        rightsConfirmed: true,
      });
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = Boolean(extracted && title.trim() && artistId && rightsConfirmed && !publishing);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Importar canción desde una URL"
    >
      <div ref={dialogRef} className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Link2 size={18} aria-hidden />
              Importar por URL
            </h2>
            <p className="mt-1 text-sm text-muted">
              Enlace directo a un archivo de audio, o una página que lo declare en sus metadatos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void extract()}
            placeholder="https://…/cancion.mp3"
            disabled={extracting}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void extract()}
            disabled={!url.trim() || extracting}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {extracting && <Loader2 size={15} className="animate-spin" aria-hidden />}
            {extracting ? 'Extrayendo…' : 'Extraer canción'}
          </button>
        </div>

        {extracting && (
          <p className="mt-3 text-xs text-muted">
            Descargando, midiendo el volumen y normalizando a −14 LUFS. Suele tardar entre 30 s y un minuto.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {extracted && (
          <section className="mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-wrap gap-5">
              <CoverImage src={extracted.coverUrl ?? ''} alt={extracted.title} size={128} rounded="rounded-lg" />

              <div className="min-w-0 flex-1 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Título
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-brand"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Artista
                  <select
                    value={artistId}
                    onChange={(e) => setArtistId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-brand"
                  >
                    <option value="">Elegir artista…</option>
                    {artists.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {extracted.artistName && !artistId && (
                    <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-amber-400">
                      El archivo dice «{extracted.artistName}», que no coincide con ningún artista del catálogo.
                      Elige uno o créalo antes.
                    </span>
                  )}
                </label>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <Fact label="Duración" value={formatDuration(extracted.durationSeconds)} />
              <Fact label="Metadatos de" value={SOURCE_LABEL[extracted.metadataSource]} />
              <Fact
                label="Volumen"
                value={
                  extracted.originalLufs !== null
                    ? `${extracted.originalLufs} → −14 LUFS`
                    : 'normalizado a −14 LUFS'
                }
              />
            </dl>

            {/* Escucharla antes de publicar es el punto de todo este paso: si
                el enlace traía otra cosa, o el audio está cortado, se ve aquí
                y no en el catálogo. */}
            <audio
              controls
              src={extracted.audioUrl}
              className="mt-4 w-full"
              aria-label={`Escuchar ${title} antes de publicar`}
            />

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span className="text-xs text-muted">
                Declaro que Peyma Music tiene los derechos para distribuir esta grabación. Queda registrado en la
                bitácora con mi nombre y el enlace de origen.
              </span>
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition-colors hover:border-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={!canPublish}
                className="flex items-center gap-2 rounded-full bg-brand px-6 py-2 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 size={15} aria-hidden />
                )}
                {publishing ? 'Publicando…' : 'Confirmar y publicar'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
