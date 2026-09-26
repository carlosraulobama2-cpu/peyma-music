import { useEffect, useState } from 'react';
import { BadgeCheck, Clock, Search as SearchIcon, UserX, TrendingUp, Download, CalendarClock, Repeat } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import {
  fetchTopListeners,
  fetchTopArtists,
  fetchTopSearches,
  fetchSignupFailures,
  fetchListeningHeatmap,
  fetchRetentionStats,
  formatHours,
  SIGNUP_STAGE_LABELS,
  type TopListener,
  type TopArtistByTime,
  type TopSearch,
  type SignupAttempt,
  type SignupStage,
  type HeatmapCell,
  type RetentionStats,
} from '../lib/audience';
import { toCsv, downloadCsv, datedFilename } from '../lib/csv';

/**
 * Audiencia: quién escucha, cuánto tiempo, a quién, qué busca y quién no
 * llegó a registrarse.
 *
 * Sobre las horas: `secondsPlayed` guarda el tiempo real desde que existe la
 * columna; los eventos anteriores se estiman con la duración completa de la
 * pista, lo que asume que nadie saltó nunca una canción y siempre infla la
 * cifra. Cada fila muestra qué proporción es estimada en vez de presentar
 * las dos cosas como si fueran medición.
 */

type Tab = 'oyentes' | 'artistas' | 'horarios' | 'retencion' | 'busquedas' | 'altas';

const TABS: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: 'oyentes', label: 'Oyentes', icon: Clock },
  { id: 'artistas', label: 'Artistas por tiempo', icon: TrendingUp },
  { id: 'horarios', label: 'Horarios', icon: CalendarClock },
  { id: 'retencion', label: 'Retención', icon: Repeat },
  { id: 'busquedas', label: 'Qué se busca', icon: SearchIcon },
  { id: 'altas', label: 'Altas fallidas', icon: UserX },
];

/** Domingo a sábado, en el mismo orden que `EXTRACT(DOW ...)` de Postgres (0 = domingo). */
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Aviso de cuánto del dato es estimación. Se calla si todo está medido.
 *
 * Ocupa su columna aunque no diga nada: si desapareciera del todo, las filas
 * sin estimación correrían las horas hacia la derecha y la columna dejaría
 * de leerse como columna.
 */
function EstimateNote({ share }: { share: number }) {
  return (
    <span
      className="w-28 shrink-0 text-right text-[11px] text-amber-400"
      title={share >= 0.01 ? 'Reproducciones sin tiempo real medido; se estima con la duración completa' : undefined}
    >
      {share >= 0.01 ? `~${Math.round(share * 100)}% estimado` : ''}
    </span>
  );
}

export function AudiencePage() {
  const [tab, setTab] = useState<Tab>('oyentes');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [listeners, setListeners] = useState<TopListener[] | null>(null);
  const [artists, setArtists] = useState<TopArtistByTime[] | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[] | null>(null);
  const [retention, setRetention] = useState<RetentionStats | null>(null);
  const [searches, setSearches] = useState<{ all: TopSearch[]; empty: TopSearch[] } | null>(null);
  const [signups, setSignups] = useState<{ byStage: Partial<Record<SignupStage, number>>; attempts: SignupAttempt[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fail = (err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.');
    };

    if (tab === 'oyentes') {
      fetchTopListeners(order)
        .then((r) => !cancelled && setListeners(r.listeners))
        .catch(fail);
    } else if (tab === 'artistas') {
      fetchTopArtists()
        .then((r) => !cancelled && setArtists(r.artists))
        .catch(fail);
    } else if (tab === 'horarios') {
      fetchListeningHeatmap()
        .then((r) => !cancelled && setHeatmap(r.cells))
        .catch(fail);
    } else if (tab === 'retencion') {
      fetchRetentionStats()
        .then((r) => !cancelled && setRetention(r))
        .catch(fail);
    } else if (tab === 'busquedas') {
      fetchTopSearches()
        .then((r) => !cancelled && setSearches({ all: r.searches, empty: r.withoutResults }))
        .catch(fail);
    } else {
      fetchSignupFailures()
        .then((r) => !cancelled && setSignups(r))
        .catch(fail);
    }

    return () => {
      cancelled = true;
    };
  }, [tab, order]);

  /**
   * Exporta lo que se está viendo ahora mismo.
   *
   * Cada pestaña tiene columnas distintas, así que el CSV se arma según la
   * activa en vez de volcar un formato genérico que no serviría para nada.
   */
  const exportCurrent = () => {
    if (tab === 'oyentes' && listeners) {
      downloadCsv(
        datedFilename('oyentes'),
        toCsv(listeners, [
          { header: 'Nombre', value: (r) => r.displayName },
          { header: 'Correo', value: (r) => r.email },
          { header: 'Reproducciones', value: (r) => r.streams },
          { header: 'Minutos', value: (r) => Math.round(r.seconds / 60) },
          { header: 'Porcentaje estimado', value: (r) => Math.round(r.estimatedShare * 100) },
          { header: 'Ultima escucha', value: (r) => r.lastPlayedAt },
        ]),
      );
    } else if (tab === 'artistas' && artists) {
      downloadCsv(
        datedFilename('artistas-por-tiempo'),
        toCsv(artists, [
          { header: 'Artista', value: (r) => r.name },
          { header: 'Verificado', value: (r) => (r.isVerified ? 'si' : 'no') },
          { header: 'Oyentes', value: (r) => r.listeners },
          { header: 'Reproducciones', value: (r) => r.streams },
          { header: 'Minutos', value: (r) => Math.round(r.seconds / 60) },
        ]),
      );
    } else if (tab === 'busquedas' && searches) {
      downloadCsv(
        datedFilename('busquedas'),
        toCsv(searches.all, [
          { header: 'Termino', value: (r) => r.sample },
          { header: 'Normalizado', value: (r) => r.normalized },
          { header: 'Busquedas', value: (r) => r.searches },
          { header: 'Media de resultados', value: (r) => r.avgResults },
        ]),
      );
    } else if (tab === 'altas' && signups) {
      downloadCsv(
        datedFilename('altas-fallidas'),
        toCsv(signups.attempts, [
          { header: 'Correo', value: (r) => r.email ?? '' },
          { header: 'Paso', value: (r) => SIGNUP_STAGE_LABELS[r.stage] },
          { header: 'Motivo', value: (r) => r.reason },
          { header: 'IP', value: (r) => r.ipAddress ?? '' },
          { header: 'Fecha', value: (r) => r.createdAt },
        ]),
      );
    }
  };

  return (
    <AdminShell
      title="Audiencia"
      subtitle="Ventana móvil de 28 días"
      actions={
        <button
          type="button"
          onClick={exportCurrent}
          className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white"
        >
          <Download size={14} aria-hidden />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === id ? 'bg-white text-black' : 'bg-white/10 text-muted hover:text-foreground'
            }`}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'oyentes' && (
        <>
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setOrder('desc')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${order === 'desc' ? 'bg-brand text-black' : 'bg-white/10 text-muted'}`}
            >
              Los que más escuchan
            </button>
            <button
              type="button"
              onClick={() => setOrder('asc')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${order === 'asc' ? 'bg-brand text-black' : 'bg-white/10 text-muted'}`}
            >
              Los que menos
            </button>
          </div>

          {!listeners ? (
            <SkeletonList />
          ) : listeners.length === 0 ? (
            <Empty>Nadie escuchó nada en la ventana.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {listeners.map((entry, index) => (
                <li
                  key={entry.userId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-sm text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.displayName}</p>
                    <p className="truncate text-xs text-muted">{entry.email}</p>
                  </div>
                  <span className="w-28 shrink-0 text-right text-sm font-bold tabular-nums">
                    {formatHours(entry.seconds)}
                  </span>
                  <EstimateNote share={entry.estimatedShare} />
                  <span className="w-24 shrink-0 text-right font-mono text-xs text-muted">{entry.streams} repr.</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'artistas' &&
        (!artists ? (
          <SkeletonList />
        ) : artists.length === 0 ? (
          <Empty>Sin reproducciones en la ventana.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {artists.map((artist, index) => (
              <li
                key={artist.artistId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
              >
                <span className="w-6 shrink-0 text-center font-mono text-sm text-muted">{index + 1}</span>
                <CoverImage src={artist.imageUrl} alt={artist.name} size={40} rounded="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {artist.name}
                    {artist.isVerified && <BadgeCheck size={14} className="shrink-0 text-sky-400" aria-label="Verificado" />}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {artist.listeners} oyente(s) · {artist.streams} reproducciones
                  </p>
                </div>
                <span className="w-28 shrink-0 text-right text-sm font-bold tabular-nums">
                  {formatHours(artist.seconds)}
                </span>
                <EstimateNote share={artist.estimatedShare} />
              </li>
            ))}
          </ul>
        ))}

      {tab === 'horarios' && (!heatmap ? <SkeletonList /> : <ListeningHeatmap cells={heatmap} />)}

      {tab === 'retencion' && (!retention ? <SkeletonList /> : <RetentionPanel stats={retention} />)}

      {tab === 'busquedas' &&
        (!searches ? (
          <SkeletonList />
        ) : (
          <>
            {searches.empty.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <h2 className="text-sm font-bold text-amber-400">Catálogo que falta</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Términos que la gente busca y no devuelven ningún resultado. Es demanda concreta sin cubrir.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {searches.empty.map((entry) => (
                    <li key={entry.normalized} className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold">
                      {entry.sample} <span className="text-muted">×{entry.searches}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {searches.all.length === 0 ? (
              <Empty>Nadie buscó nada todavía en la ventana.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {searches.all.map((entry, index) => (
                  <li
                    key={entry.normalized}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-sm text-muted">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.sample}</span>
                    <span
                      className={`w-32 shrink-0 text-right text-xs font-semibold ${entry.avgResults === 0 ? 'text-amber-400' : 'text-muted'}`}
                    >
                      {entry.avgResults} resultado(s)
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">{entry.searches}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}

      {tab === 'altas' &&
        (!signups ? (
          <SkeletonList />
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(SIGNUP_STAGE_LABELS) as SignupStage[]).map((stage) => (
                <div key={stage} className="rounded-xl border border-white/10 bg-surface p-4">
                  <p className="text-xs text-muted">{SIGNUP_STAGE_LABELS[stage]}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{signups.byStage[stage] ?? 0}</p>
                </div>
              ))}
            </div>

            {signups.attempts.length === 0 ? (
              <Empty>Ninguna alta falló. Todos los registros llegaron a crear cuenta.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {signups.attempts.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
                  >
                    {/* Ancho fijo: las cuatro etiquetas miden distinto y sin
                        esto el correo arrancaba en un sitio en cada fila. */}
                    <span className="w-44 shrink-0 truncate rounded-full bg-danger/15 px-2.5 py-1 text-center text-xs font-bold text-danger">
                      {SIGNUP_STAGE_LABELS[attempt.stage]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{attempt.email ?? '(sin correo)'}</span>
                    <span className="truncate text-xs text-muted">{attempt.reason}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {new Date(attempt.createdAt).toLocaleString('es', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
    </AdminShell>
  );
}

/**
 * Grilla de 7×24: un color más intenso por celda cuanto más se escucha en
 * ese día y esa hora. En UTC — con oyentes en husos distintos no existe
 * "la" hora local de todos, así que se dice el huso en vez de fingir uno.
 */
function ListeningHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) return <Empty>Nadie escuchó nada en la ventana.</Empty>;

  const byKey = new Map(cells.map((cell) => [`${cell.dayOfWeek}-${cell.hour}`, cell.streams]));
  const max = Math.max(...cells.map((cell) => cell.streams), 1);
  const peak = cells.reduce((best, cell) => (cell.streams > best.streams ? cell : best), cells[0]!);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Pico de actividad: <span className="font-semibold text-foreground">{DAY_LABELS[peak.dayOfWeek]}</span> a las{' '}
        <span className="font-semibold text-foreground">{String(peak.hour).padStart(2, '0')}:00 UTC</span>, con{' '}
        {peak.streams} reproducciones.
      </p>

      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/10 bg-surface p-4">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `2.5rem repeat(24, minmax(1.5rem, 1fr))` }}>
          <div />
          {[...Array(24)].map((_, hour) => (
            <div key={hour} className="text-center font-mono text-[10px] text-muted">
              {hour % 3 === 0 ? hour : ''}
            </div>
          ))}

          {DAY_LABELS.map((label, dayOfWeek) => (
            <div key={label} className="contents">
              <div className="flex items-center text-xs font-semibold text-muted">{label}</div>
              {[...Array(24)].map((_, hour) => {
                const streams = byKey.get(`${dayOfWeek}-${hour}`) ?? 0;
                const intensity = streams / max;
                return (
                  <div
                    key={hour}
                    title={`${label} ${String(hour).padStart(2, '0')}:00 UTC — ${streams} reproducciones`}
                    className="aspect-square rounded-sm"
                    style={{ backgroundColor: intensity === 0 ? 'rgba(255,255,255,0.05)' : `rgba(29,185,84,${0.15 + intensity * 0.85})` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tarjetas de retención acumulada: día 1 ⊂ semana ⊂ mes, cada una sobre la cohorte con 30 días o más desde su primera escucha. */
function RetentionPanel({ stats }: { stats: RetentionStats }) {
  if (stats.cohortSize === 0) {
    return <Empty>Todavía no hay usuarios con 30 días o más desde su primera escucha.</Empty>;
  }

  const rows: { label: string; returned: number; hint: string }[] = [
    { label: 'Volvió al día siguiente', returned: stats.returnedDay1, hint: 'Entre el día 1 y el día 2' },
    { label: 'Volvió dentro de la semana', returned: stats.returnedDay7, hint: 'En los primeros 7 días' },
    { label: 'Volvió dentro del mes', returned: stats.returnedDay30, hint: 'En los primeros 30 días' },
  ];

  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Sobre <span className="font-semibold text-foreground">{stats.cohortSize}</span> usuario(s) cuya primera
        escucha fue hace 30 días o más — a los únicos a quienes ya les dio tiempo de completar las tres ventanas.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map((row) => {
          const pct = Math.round((row.returned / stats.cohortSize) * 100);
          return (
            <div key={row.label} className="rounded-xl border border-white/10 bg-surface p-5">
              <p className="text-sm font-semibold">{row.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-brand">{pct}%</p>
              <p className="mt-1 text-xs text-muted">
                {row.returned} de {stats.cohortSize} · {row.hint}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-surface" />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">{children}</p>
  );
}
