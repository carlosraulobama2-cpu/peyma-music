import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, BadgeCheck, Download } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { fetchTrending, formatHours, type TrendingRow } from '../lib/audience';
import { toCsv, downloadCsv, datedFilename } from '../lib/csv';

/** Duración de una pista como m:ss. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const WINDOWS = [
  { days: 1, label: 'Hoy' },
  { days: 7, label: '7 días' },
  { days: 28, label: '28 días' },
];

/**
 * Tendencias, con el número 1 destacado arriba.
 *
 * Cada fila lleva lo que pediste que se vea siempre de una canción: portada,
 * título, ritmo (género y BPM) y artista. El nombre del artista es un enlace
 * a su ficha, no texto muerto.
 */
export function TrendingPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ top1: TrendingRow | null; tracks: TrendingRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrending(days)
      .then((res) => !cancelled && setData({ top1: res.top1, tracks: res.tracks }))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las tendencias.');
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <AdminShell
      title="Tendencias"
      subtitle="Lo más escuchado de la plataforma"
      actions={
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!data || data.tracks.length === 0}
            onClick={() =>
              data &&
              downloadCsv(
                datedFilename(`tendencias-${days}d`),
                toCsv(data.tracks, [
                  { header: 'Posicion', value: (_r) => data.tracks.indexOf(_r) + 1 },
                  { header: 'Titulo', value: (r) => r.title },
                  { header: 'Artista', value: (r) => r.artistName },
                  { header: 'Ritmo', value: (r) => r.genre ?? '' },
                  { header: 'BPM', value: (r) => r.bpm ?? '' },
                  { header: 'Reproducciones', value: (r) => r.streams },
                  { header: 'Oyentes', value: (r) => r.listeners },
                  { header: 'Minutos', value: (r) => Math.round(r.seconds / 60) },
                ]),
              )
            }
            className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white disabled:opacity-40"
          >
            <Download size={13} aria-hidden />
            CSV
          </button>
          {WINDOWS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setDays(option.days)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                days === option.days ? 'bg-white text-black' : 'bg-white/10 text-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!data ? (
        <div className="flex flex-col gap-3">
          <div className="h-36 animate-pulse rounded-2xl border border-white/10 bg-surface" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : !data.top1 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          Sin reproducciones en esta ventana. Probá con 28 días.
        </p>
      ) : (
        <>
          <section className="mb-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-transparent p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400">
              <Crown size={14} aria-hidden />
              Número 1 ahora mismo
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <CoverImage src={data.top1.coverUrl} alt={data.top1.title} size={112} rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-2xl font-extrabold">{data.top1.title}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/artists?search=${encodeURIComponent(data.top1!.artistName)}`)}
                  className="mt-1 flex items-center gap-1.5 text-base font-semibold text-muted transition-colors hover:text-foreground hover:underline"
                >
                  {data.top1.artistName}
                  {data.top1.isVerified && <BadgeCheck size={15} className="text-sky-400" aria-label="Verificado" />}
                </button>
                <p className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs text-muted">
                  {data.top1.genre && <span>{data.top1.genre}</span>}
                  {data.top1.bpm !== null && <span>{data.top1.bpm} BPM</span>}
                  <span>{formatDuration(data.top1.duration)}</span>
                </p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{data.top1.streams}</p>
                  <p className="text-xs text-muted">reproducciones</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{data.top1.listeners}</p>
                  <p className="text-xs text-muted">oyentes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{formatHours(data.top1.seconds)}</p>
                  <p className="text-xs text-muted">escuchadas</p>
                </div>
              </div>
            </div>
          </section>

          <ul className="flex flex-col gap-2">
            {data.tracks.map((track, index) => (
              <li
                key={track.trackId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-3 py-2.5"
              >
                <span className="w-6 shrink-0 text-center font-mono text-sm text-muted">{index + 1}</span>
                <CoverImage src={track.coverUrl} alt={track.title} size={44} rounded="rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{track.title}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                    <button
                      type="button"
                      onClick={() => navigate(`/artists?search=${encodeURIComponent(track.artistName)}`)}
                      className="truncate transition-colors hover:text-foreground hover:underline"
                    >
                      {track.artistName}
                    </button>
                    {track.isVerified && <BadgeCheck size={12} className="shrink-0 text-sky-400" aria-label="Verificado" />}
                  </p>
                </div>
                <span className="hidden shrink-0 gap-2 font-mono text-[11px] text-muted sm:flex">
                  {track.genre && <span>{track.genre}</span>}
                  {track.bpm !== null && <span>{track.bpm} BPM</span>}
                  <span>{formatDuration(track.duration)}</span>
                </span>
                <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums">{track.streams}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminShell>
  );
}
