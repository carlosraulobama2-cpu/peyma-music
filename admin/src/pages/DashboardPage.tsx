import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Users, Headphones, Music, AlertTriangle, Clock, Crown, BadgeCheck, Flag } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { LiveListenerMap } from '../components/LiveListenerMap';
import { fetchMetrics, type AdminMetrics } from '../lib/metrics';

/**
 * Tablero principal: métricas en vivo y estado del catálogo.
 *
 * Se refresca solo cada 15 segundos. Es un intervalo, no un WebSocket, a
 * propósito: el backend ya tiene un socket, pero es el de sincronía del
 * reproductor (Peyma Connect) y meterle un canal de métricas mezclaría dos
 * responsabilidades muy distintas en el mismo lugar. Un sondeo cada 15 s
 * sobre una consulta agregada es barato y suficiente para un tablero.
 */

const REFRESH_MS = 15_000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es').format(value);
}

interface MetricCardProps {
  icon: typeof Radio;
  label: string;
  value: string;
  hint?: string;
  tone?: 'normal' | 'warn' | 'critical' | 'live';
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'normal' }: MetricCardProps) {
  const toneClass =
    tone === 'critical'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'live'
          ? 'text-brand'
          : 'text-foreground';

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon size={15} aria-hidden />
        {label}
      </div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/**
 * Gráfico de barras de 28 días, en SVG puro.
 *
 * Sin librería de gráficos: son 28 rectángulos. Añadir Recharts o Chart.js
 * para esto metería ~150 KB en el bundle para dibujar lo que cabe en 20
 * líneas, y el panel ya carga rápido.
 */
function DailyChart({ data }: { data: { day: string; streams: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Todavía no hay reproducciones registradas en la ventana.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.streams), 1);

  return (
    <div className="flex h-40 items-end gap-1.5">
      {data.map((point) => (
        <div key={point.day} className="group relative flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-t bg-brand/70 transition-colors group-hover:bg-brand"
            style={{ height: `${Math.max(2, (point.streams / max) * 100)}%` }}
          />
          {/* Etiqueta al pasar el cursor: con 28 barras no caben todas fijas. */}
          <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded bg-black/90 px-2 py-1 text-[11px] group-hover:block">
            {point.day}: {formatNumber(point.streams)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchMetrics()
        .then((data) => {
          if (cancelled) return;
          setMetrics(data);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las métricas.');
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <AdminShell title="Tablero" subtitle={metrics ? `Ventana móvil de ${metrics.windowDays} días` : 'Cargando…'}>
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : (
        <>
          {/* El nº 1 va arriba del todo, con lo que pediste que se vea
              siempre de una canción: portada, título, ritmo y artista, y el
              artista enlazado a su ficha. */}
          {metrics.top1 && (
            <section className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-transparent p-5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400">
                <Crown size={14} aria-hidden />
                Número 1 esta semana
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <CoverImage src={metrics.top1.coverUrl} alt={metrics.top1.title} size={80} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-extrabold">{metrics.top1.title}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/artists?search=${encodeURIComponent(metrics.top1!.artistName)}`)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-foreground hover:underline"
                  >
                    {metrics.top1.artistName}
                    {metrics.top1.isVerified && <BadgeCheck size={13} className="text-sky-400" aria-label="Verificado" />}
                  </button>
                  <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                    {metrics.top1.genre && <span>{metrics.top1.genre}</span>}
                    {metrics.top1.bpm !== null && <span>{metrics.top1.bpm} BPM</span>}
                    <span>{formatNumber(metrics.top1.streams)} reproducciones</span>
                    <span>{formatNumber(metrics.top1.listeners)} oyentes</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/trending')}
                  className="shrink-0 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold transition-colors hover:border-white"
                >
                  Ver tendencias
                </button>
              </div>
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              icon={Radio}
              label="Escuchando ahora"
              value={formatNumber(metrics.audience.liveListeners)}
              hint="Oyentes distintos en los últimos 5 minutos"
              tone="live"
            />
            <MetricCard
              icon={Users}
              label="Oyentes mensuales"
              value={formatNumber(metrics.audience.listeners28d)}
              hint={`Usuarios distintos en ${metrics.windowDays} días`}
            />
            <MetricCard
              icon={Headphones}
              label="Reproducciones"
              value={formatNumber(metrics.audience.streams28d)}
              hint={`Total en ${metrics.windowDays} días`}
            />
            <MetricCard
              icon={Music}
              label="Catálogo"
              value={formatNumber(metrics.catalog.totalTracks)}
              hint={`${formatNumber(metrics.catalog.totalArtists)} artistas · ${formatNumber(metrics.catalog.verifiedArtists)} verificados · ${formatNumber(metrics.catalog.blockedArtists)} bloqueados`}
            />
            <MetricCard
              icon={Clock}
              label="Esperando moderación"
              value={formatNumber(metrics.catalog.pendingReview)}
              hint={
                metrics.catalog.pendingReview >= metrics.alerts.moderationThreshold
                  ? `Supera el umbral de ${metrics.alerts.moderationThreshold} — revisá pronto`
                  : 'Pistas invisibles hasta ser aprobadas'
              }
              tone={
                metrics.catalog.pendingReview >= metrics.alerts.moderationThreshold
                  ? 'critical'
                  : metrics.catalog.pendingReview > 0
                    ? 'warn'
                    : 'normal'
              }
            />
            <MetricCard
              icon={Flag}
              label="Denuncias abiertas"
              value={formatNumber(metrics.catalog.openReports)}
              hint={
                metrics.catalog.openReports >= metrics.alerts.reportsThreshold
                  ? `Supera el umbral de ${metrics.alerts.reportsThreshold}`
                  : 'Sin revisar todavía'
              }
              tone={
                metrics.catalog.openReports >= metrics.alerts.reportsThreshold
                  ? 'critical'
                  : metrics.catalog.openReports > 0
                    ? 'warn'
                    : 'normal'
              }
            />
            <MetricCard
              icon={AlertTriangle}
              label="Trabajos fallidos"
              value={formatNumber(metrics.jobs.failed)}
              hint={`${formatNumber(metrics.jobs.active)} en cola o corriendo`}
              tone={metrics.jobs.failed > 0 ? 'warn' : 'normal'}
            />
          </div>

          <div className="mt-8">
            <LiveListenerMap />
          </div>

          <section className="mt-6 rounded-xl border border-white/10 bg-surface p-5">
            <h2 className="text-sm font-bold">Reproducciones por día</h2>
            <p className="mt-0.5 mb-5 text-xs text-muted">Últimos {metrics.windowDays} días</p>
            <DailyChart data={metrics.dailyStreams} />
          </section>

          <section className="mt-6 rounded-xl border border-white/10 bg-surface p-5">
            <h2 className="text-sm font-bold">Géneros más escuchados</h2>
            <p className="mt-0.5 mb-4 text-xs text-muted">
              Alimenta la rotación automática de portadas en la pestaña Buscar
            </p>
            {metrics.topGenres.length === 0 ? (
              <p className="py-4 text-sm text-muted">Sin datos en la ventana.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {metrics.topGenres.map((entry) => {
                  const top = metrics.topGenres[0]?.streams ?? 1;
                  return (
                    <li key={entry.genre} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate font-semibold">{entry.genre}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(2, (entry.streams / top) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right tabular-nums text-muted">
                        {formatNumber(entry.streams)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {metrics.catalog.pendingReview > 0 && (
            <button
              type="button"
              onClick={() => navigate('/moderation')}
              className="mt-6 rounded-full bg-brand px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
            >
              Revisar {metrics.catalog.pendingReview} pista(s) pendiente(s)
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}
