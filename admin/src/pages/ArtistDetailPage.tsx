import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ShieldOff, ShieldCheck, Trash2, Flag, Play, UserCheck } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CoverImage } from '../components/CoverImage';
import {
  fetchArtistDetail,
  bulkBlockTracks,
  bulkDeleteTracks,
  setArtistOwner,
  type AdminArtistDetail,
  type AdminArtistTrack,
} from '../lib/artists';
import { formatDuration } from '../lib/format';
import { STATUS_LABEL } from '../lib/moderation';

/**
 * Ficha de un artista.
 *
 * Existe para que decidir sobre alguien no obligue a recorrer cuatro
 * pantallas. Aquí están su perfil, sus métricas reales, sus denuncias
 * abiertas y todas sus canciones — incluidas las pendientes y las
 * bloqueadas, que el catálogo público no devuelve y que son justo las que
 * hay que mirar.
 *
 * Las acciones son por selección: se marcan las canciones que sobran y se
 * actúa una vez. Ir de una en una con un clic por canción es donde se
 * cometen los errores.
 */

export function ArtistDetailPage() {
  const { id = '' } = useParams<{ id: string }>();

  const [data, setData] = useState<AdminArtistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState(false);

  const load = useCallback(() => {
    fetchArtistDetail(id)
      .then((res) => {
        setData(res);
        // La selección se vacía tras recargar: sus ids pueden ya no existir,
        // y dejarla puesta invitaría a repetir la acción sobre otra cosa.
        setSelected(new Set());
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cargar el artista.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const toggle = (trackId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

  const toggleAll = (tracks: AdminArtistTrack[]) =>
    setSelected((current) => (current.size === tracks.length ? new Set() : new Set(tracks.map((t) => t.id))));

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
      setPendingDelete(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminShell title="Artista" subtitle="Cargando…">
        <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-surface" />
      </AdminShell>
    );
  }

  if (error && !data) {
    return (
      <AdminShell title="Artista" subtitle="No disponible">
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      </AdminShell>
    );
  }

  if (!data) return null;

  const { artist, stats, tracks, denunciasPendientes } = data;
  const ids = [...selected];
  // Si todo lo marcado ya está bloqueado, el botón restaura en vez de bloquear.
  const allSelectedBlocked = ids.length > 0 && ids.every((tid) => tracks.find((t) => t.id === tid)?.isBlocked);

  return (
    <AdminShell
      title={artist.name}
      subtitle={`${artist._count.tracks} canción(es) · ${stats.followers} seguidor(es)`}
      actions={
        <Link
          to="/artists"
          className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white"
        >
          <ArrowLeft size={14} aria-hidden />
          <span className="hidden sm:inline">Artistas</span>
        </Link>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <header className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border border-white/10 bg-surface p-5">
        <CoverImage src={artist.imageUrl} alt={artist.name} size={96} rounded="rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-2xl font-extrabold">
            {artist.name}
            {artist.isVerified && <BadgeCheck size={18} className="text-sky-400" aria-label="Verificado" />}
            {artist.isBlocked && (
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">BLOQUEADO</span>
            )}
          </p>
          {/* La titularidad es lo que decide quién puede subirle canciones,
              así que se muestra siempre — también cuando no hay dueño, que
              es el caso que hay que resolver. */}
          <OwnerRow
            artistId={artist.id}
            owner={artist.owner}
            onChanged={load}
            onError={setError}
          />
          {denunciasPendientes > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-400">
              <Flag size={14} aria-hidden />
              {denunciasPendientes} denuncia(s) sin resolver
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Metric label="Oyentes/mes" value={stats.monthlyListeners} />
          <Metric label="Seguidores" value={stats.followers} />
          <Metric label="Reproducciones" value={stats.totalStreams} />
        </div>
      </header>

      {/*
        La barra de acciones sólo aparece con algo marcado. Tenerla siempre
        visible pero inerte invita a pulsarla sin haber elegido nada.
      */}
      {ids.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
          <p className="text-sm font-semibold">{ids.length} seleccionada(s)</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => bulkBlockTracks(artist.id, ids, !allSelectedBlocked), 'No se pudo cambiar el bloqueo.')}
              className="flex items-center gap-1.5 rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-white disabled:opacity-50"
            >
              {allSelectedBlocked ? <ShieldCheck size={13} aria-hidden /> : <ShieldOff size={13} aria-hidden />}
              {allSelectedBlocked ? 'Restaurar' : 'Bloquear'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPendingDelete(true)}
              className="flex items-center gap-1.5 rounded-full border border-danger/50 px-3.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:border-danger disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          Este artista todavía no tiene canciones.
        </p>
      ) : (
        <>
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
            <input
              type="checkbox"
              checked={selected.size === tracks.length}
              onChange={() => toggleAll(tracks)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Seleccionar todas ({tracks.length})
          </label>

          <ul className="flex flex-col gap-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className={`flex flex-wrap items-center gap-4 rounded-xl border p-3 transition-colors ${
                  selected.has(track.id) ? 'border-brand/60 bg-brand/5' : 'border-white/10 bg-surface'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(track.id)}
                  onChange={() => toggle(track.id)}
                  aria-label={`Seleccionar ${track.title}`}
                  className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                <CoverImage src={track.coverUrl} alt={track.title} size={48} rounded="rounded-md" />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold">
                    {track.title}
                    {track.isBlocked && (
                      <span
                        className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger"
                        title={track.blockedReason ?? 'Retirada'}
                      >
                        BLOQUEADA
                      </span>
                    )}
                    {track.status !== 'APPROVED' && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
                        {STATUS_LABEL[track.status]}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatDuration(track.duration)}
                    {track.genre && ` · ${track.genre}`}
                    {track.album && ` · ${track.album.title}`}
                  </p>
                </div>

                {/* Ancho fijo: con el ancho al contenido, "998" y "10.411"
                    dejaban la cifra en una x distinta en cada fila. */}
                <p className="flex w-24 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold tabular-nums text-muted">
                  <Play size={12} aria-hidden />
                  {track.playCount.toLocaleString('es')}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* El diálogo se monta sólo al pedirlo: el componente no tiene una
          prop `open`, se muestra por su mera presencia. */}
      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar ${ids.length} canción(es)`}
          message="Esta acción no se puede deshacer. Si sólo quieres retirarlas del catálogo, usa Bloquear: eso sí es reversible."
          confirmLabel="Eliminar definitivamente"
          isSubmitting={busy}
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => void act(() => bulkDeleteTracks(artist.id, ids), 'No se pudieron eliminar.')}
        />
      )}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-extrabold tabular-nums">{value.toLocaleString('es')}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

/**
 * Quién es el dueño del artista, y cómo cambiarlo.
 *
 * Es la única vía para reclamar un perfil del catálogo desde que subir una
 * canción dejó de apropiárselo. Antes, el primero que intentaba subirle
 * algo a un artista importado se quedaba con él sin probar nada; ahora la
 * decisión es de un administrador, aquí.
 *
 * Se pide el CORREO y no un identificador: quien reclama un perfil escribe
 * desde su correo, y hacer que alguien busque un cuid antes de poder
 * actuar sólo añade un paso donde equivocarse.
 */
function OwnerRow({
  artistId,
  owner,
  onChanged,
  onError,
}: {
  artistId: string;
  owner: { id: string; email: string; displayName: string } | null;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const aplicar = async (valor: string | null) => {
    setGuardando(true);
    onError(null);
    try {
      await setArtistOwner(artistId, valor);
      setEditando(false);
      setCorreo('');
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo cambiar la titularidad.');
    } finally {
      setGuardando(false);
    }
  };

  if (editando) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (correo.trim()) void aplicar(correo.trim());
        }}
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoFocus
          required
          placeholder="correo de la cuenta"
          className="w-64 rounded-lg border border-white/15 bg-black/25 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={guardando || correo.trim() === ''}
          className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-40"
        >
          {guardando ? 'Asignando…' : 'Asignar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditando(false);
            setCorreo('');
          }}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold transition-colors hover:border-white"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
      {owner ? (
        <>
          <UserCheck size={14} className="shrink-0 text-muted" aria-hidden />
          <span className="text-sm text-muted">
            {owner.displayName} · {owner.email}
          </span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs font-semibold text-muted underline transition-colors hover:text-foreground"
          >
            Cambiar
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void aplicar(null)}
            className="text-xs font-semibold text-muted underline transition-colors hover:text-danger disabled:opacity-40"
          >
            Quitar
          </button>
        </>
      ) : (
        <>
          {/* Sin dueño es un estado que hay que ver, no un hueco: es el que
              impide que su artista real pueda subir nada. */}
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
            SIN DUEÑO
          </span>
          <span className="text-sm text-muted">Nadie puede subirle canciones todavía.</span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs font-semibold text-brand underline transition-colors hover:text-brand-hover"
          >
            Asignar dueño
          </button>
        </>
      )}
    </div>
  );
}
