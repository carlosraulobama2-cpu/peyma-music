import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Flame, BadgeCheck, X, Check } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import {
  fetchPromotions,
  approvePromotion,
  rejectPromotion,
  cancelPromotion,
  reorderPromotions,
  PROMOTION_STATUS_LABEL,
  type Promotion,
} from '../lib/promotions';

const money = new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' });

/** "2d 4h", "5h 20min" o "menos de 1 min" — nunca segundos, no hace falta esa precisión para saber si una campaña se acaba. */
function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes} min`;
  return 'menos de 1 min';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Cola de "Primera fila": el artista paga por destacar una canción en la
 * fila superior del inicio. Tres bandejas, no una tabla única, porque cada
 * una pide una acción distinta: aprobar/rechazar una solicitud no tiene
 * nada que ver con reordenar lo que ya está en el aire.
 */
export function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [pricePerDayCents, setPricePerDayCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const cargar = useCallback(
    () =>
      fetchPromotions()
        .then((res) => {
          setPromotions(res.promotions);
          setPricePerDayCents(res.pricePerDayCents);
        })
        .catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las promociones.'))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pending = useMemo(() => promotions.filter((p) => p.status === 'PENDING_APPROVAL'), [promotions]);
  const active = useMemo(
    () => promotions.filter((p) => p.status === 'ACTIVE').sort((a, b) => a.position - b.position),
    [promotions],
  );
  const history = useMemo(
    () =>
      promotions
        .filter((p) => p.status === 'REJECTED' || p.status === 'EXPIRED' || p.status === 'CANCELLED')
        .slice(0, 20),
    [promotions],
  );

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await approvePromotion(id);
      await cargar();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo aprobar la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await rejectPromotion(id, rejectReason.trim() || undefined);
      setRejectingId(null);
      setRejectReason('');
      await cargar();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo rechazar la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await cancelPromotion(id);
      await cargar();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo retirar la campaña.');
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const reordered = [...active];
    const neighbourIndex = index + direction;
    const current = reordered[index];
    const neighbour = reordered[neighbourIndex];
    if (!current || !neighbour) return;

    reordered[index] = neighbour;
    reordered[neighbourIndex] = current;

    setBusyId(current.id);
    setActionError(null);
    try {
      await reorderPromotions(reordered.map((p) => p.id));
      await cargar();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo reordenar.');
    } finally {
      setBusyId(null);
    }
  };

  const error = actionError ?? loadError;

  return (
    <AdminShell
      title="Primera fila"
      subtitle="Canciones destacadas en la fila superior del inicio, pagadas por sus artistas."
      actions={
        pending.length > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-400 ring-1 ring-inset ring-amber-500/30">
            {pending.length} solicitud{pending.length === 1 ? '' : 'es'} pendiente{pending.length === 1 ? '' : 's'}
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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Solicitudes pendientes</h2>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 px-5 py-8 text-center text-sm text-muted">
                No hay solicitudes esperando revisión.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((promo) => (
                  <div key={promo.id} className="rounded-xl border border-white/10 bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <CoverImage src={promo.track.coverUrl} alt={promo.track.title} size={56} rounded="rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{promo.track.title}</p>
                        <p className="flex items-center gap-1 truncate text-sm text-muted">
                          {promo.track.artist.name}
                          {promo.track.artist.isVerified && <BadgeCheck size={12} className="text-sky-400" aria-label="Verificado" />}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Pedido por {promo.requestedBy.displayName} · {formatDate(promo.createdAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold">{promo.days} día{promo.days === 1 ? '' : 's'}</p>
                        <p className="text-xs text-muted">{money.format(promo.priceCents / 100)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(promo.id)}
                          disabled={busyId === promo.id}
                          className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                          <Check size={13} /> Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(rejectingId === promo.id ? null : promo.id)}
                          disabled={busyId === promo.id}
                          className="flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                        >
                          <X size={13} /> Rechazar
                        </button>
                      </div>
                    </div>

                    {rejectingId === promo.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Motivo (opcional)"
                          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-brand"
                        />
                        <button
                          type="button"
                          onClick={() => handleReject(promo.id)}
                          disabled={busyId === promo.id}
                          className="shrink-0 rounded-full bg-danger px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Confirmar rechazo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              En la primera fila ahora ({active.length})
            </h2>
            {active.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF6B6B22]">
                  <Flame size={20} color="#FF6B6B" />
                </div>
                <p className="text-sm text-muted">Ninguna campaña activa en este momento.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {active.map((promo, index) => (
                  <div key={promo.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-surface p-3">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || busyId === promo.id}
                        aria-label="Subir"
                        className="text-muted transition-colors hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === active.length - 1 || busyId === promo.id}
                        aria-label="Bajar"
                        className="text-muted transition-colors hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-muted">{index + 1}</span>
                    <CoverImage src={promo.track.coverUrl} alt={promo.track.title} size={48} rounded="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{promo.track.title}</p>
                      <p className="truncate text-sm text-muted">{promo.track.artist.name}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted">
                      {promo.msRemaining !== null && (
                        <p className="font-semibold text-brand">Quedan {formatRemaining(promo.msRemaining)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancel(promo.id)}
                      disabled={busyId === promo.id}
                      className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                    >
                      Retirar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Historial reciente</h2>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <tbody>
                    {history.map((promo) => (
                      <tr key={promo.id} className="border-b border-white/5 last:border-0 odd:bg-white/[0.02]">
                        <td className="truncate px-4 py-2.5 font-medium">{promo.track.title}</td>
                        <td className="truncate px-4 py-2.5 text-muted">{promo.track.artist.name}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{promo.days} día(s)</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              promo.status === 'REJECTED'
                                ? 'bg-danger/15 text-danger'
                                : promo.status === 'CANCELLED'
                                  ? 'bg-white/10 text-muted'
                                  : 'bg-white/10 text-muted'
                            }`}
                          >
                            {PROMOTION_STATUS_LABEL[promo.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-xs text-muted">Precio: {money.format(pricePerDayCents / 100)} por día.</p>
        </div>
      )}
    </AdminShell>
  );
}
