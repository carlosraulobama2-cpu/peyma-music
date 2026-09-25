import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, AlertTriangle } from 'lucide-react';
import { CoverImage } from './CoverImage';
import { StatusBadge } from './StatusBadge';
import { ReasonModal } from './ReasonModal';
import { AudioPreview } from './AudioPreview';
import type { ModerationTrack } from '../lib/moderation';
import { fetchGenreOptions, setTrackGenre, type GenreOption } from '../lib/trackGenre';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TrackRowProps {
  track: ModerationTrack;
  isPending: boolean;
  onApprove: (trackId: string) => void;
  onReject: (trackId: string, reason: string) => void;
}

export function TrackRow({ track, isPending, onApprove, onReject }: TrackRowProps) {
  const navigate = useNavigate();
  const [showReasonModal, setShowReasonModal] = useState(false);

  /**
   * Ritmo editable desde la propia fila.
   *
   * Se edita aquí y no en una pantalla aparte porque el momento natural para
   * etiquetar una canción es mientras se la está escuchando para aprobarla,
   * no en una segunda visita. `genero` guarda el id elegido; el nombre que
   * llega del servidor sólo sirve para pintar el valor inicial.
   */
  const [generos, setGeneros] = useState<GenreOption[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGenero, setErrorGenero] = useState(false);

  useEffect(() => {
    fetchGenreOptions()
      .then(setGeneros)
      .catch(() => setGeneros([]));
  }, []);

  /**
   * El género que muestra el desplegable.
   *
   * El servidor manda el NOMBRE del ritmo, no su id, porque el resto del
   * panel lo pinta como texto; hay que traducirlo a id para preseleccionar.
   * Eso se DERIVA de lo que hay, no se copia a estado con un efecto: copiarlo
   * obligaba a un render extra y, entre medias, el desplegable se pintaba
   * vacío aunque la pista ya tuviera género.
   *
   * `elegido` sólo existe para lo que el usuario acaba de tocar y todavía no
   * ha confirmado el servidor; mientras sea null manda lo que dice la pista.
   */
  const genero = elegido ?? (generos.find((g) => g.name === track.genre)?.id ?? '');

  const cambiarGenero = async (nuevo: string) => {
    const anterior = genero;
    setElegido(nuevo);
    setGuardando(true);
    setErrorGenero(false);
    try {
      await setTrackGenre(track.id, nuevo || null);
    } catch {
      // Se revierte a lo que había: dejar el desplegable mostrando un ritmo
      // que no se llegó a guardar es peor que no haber cambiado nada.
      setElegido(anterior);
      setErrorGenero(true);
    } finally {
      setGuardando(false);
    }
  };

  const analysis = track.analysis;
  // Un pico real por encima de 0 dBTP significa que el máster viene
  // recortando. No bloquea la aprobación, pero el revisor debería verlo.
  const isClipping = analysis?.truePeakDb != null && analysis.truePeakDb > 0;

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-surface p-4 transition-colors hover:border-white/20">
        <div className="flex items-start gap-4">
          <CoverImage src={track.coverUrl} alt={track.title} size={96} rounded="rounded-lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold">{track.title}</p>
              {track.isExplicit && (
                <span className="rounded bg-white/15 px-1.5 text-[10px] font-bold text-muted" title="Contenido explícito">
                  E
                </span>
              )}
              <StatusBadge status={track.status} />
            </div>

            {/* El nombre del artista es un enlace a su ficha, no texto
                muerto: desde la cola de revisión hay que poder ir a ver
                quién sube esto sin buscarlo a mano. */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              <button
                type="button"
                onClick={() => navigate(`/artists?search=${encodeURIComponent(track.artist.name)}`)}
                className="font-semibold text-foreground transition-colors hover:underline"
              >
                {track.artist.name}
              </button>
              {track.artist.isVerified && <BadgeCheck size={14} className="shrink-0 text-sky-400" aria-label="Verificado" />}
              <span>· {formatDuration(track.duration)}</span>
              {/* Ritmo: el género y, cuando el análisis ya corrió, el tempo. */}
              {track.genre && <span>· {track.genre}</span>}
              {analysis && analysis.bpm > 0 && <span>· {Math.round(analysis.bpm)} BPM</span>}
              {track.album && <span className="truncate">· {track.album.title}</span>}
            </p>

            <div className="mt-1.5 flex items-center gap-2">
              <label className="text-xs text-muted" htmlFor={`ritmo-${track.id}`}>
                Ritmo
              </label>
              <select
                id={`ritmo-${track.id}`}
                value={genero}
                disabled={guardando}
                onChange={(e) => void cambiarGenero(e.target.value)}
                className="rounded border border-white/15 bg-black/25 px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-50"
              >
                <option value="">Sin ritmo</option>
                {generos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {errorGenero && <span className="text-xs text-danger">No se pudo guardar</span>}
            </div>

            {track.uploadedBy && (
              <p className="mt-0.5 truncate text-xs text-muted">
                Subido por {track.uploadedBy.displayName} ({track.uploadedBy.email})
              </p>
            )}

            {analysis && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                {analysis.integratedLufs != null && <span>{analysis.integratedLufs} LUFS</span>}
                {analysis.truePeakDb != null && (
                  <span className={isClipping ? 'font-bold text-amber-400' : undefined}>
                    pico {analysis.truePeakDb} dBTP
                  </span>
                )}
                {isClipping && (
                  <span className="flex items-center gap-1 font-sans font-semibold text-amber-400">
                    <AlertTriangle size={12} aria-hidden />
                    el máster viene recortando
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <button
              onClick={() => onApprove(track.id)}
              disabled={isPending}
              className="rounded-full bg-brand px-5 py-2 text-xs font-bold text-black transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              Aprobar
            </button>
            <button
              onClick={() => setShowReasonModal(true)}
              disabled={isPending}
              className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>

        {/* El reproductor va debajo y a todo el ancho: la onda necesita
            espacio para ser legible, y comprimirla junto a la portada la
            dejaría en una tira inútil de 100 px. */}
        <div className="mt-4 border-t border-white/5 pt-3">
          <AudioPreview
            trackId={track.id}
            waveformPeaks={analysis?.waveformPeaks}
            durationHint={track.duration}
          />
        </div>
      </div>

      {showReasonModal && (
        <ReasonModal
          trackTitle={track.title}
          isSubmitting={isPending}
          onCancel={() => setShowReasonModal(false)}
          onConfirm={(reason) => {
            onReject(track.id, reason);
            setShowReasonModal(false);
          }}
        />
      )}
    </>
  );
}
