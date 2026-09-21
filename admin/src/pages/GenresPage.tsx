import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { fetchGenres, createGenre, updateGenre, deleteGenre, type MusicGenre } from '../lib/audience';

/**
 * Ritmos musicales.
 *
 * Este vocabulario es ABIERTO y convive con el enum `Genre` de Postgres, que
 * no se puede ampliar sin migración. Lo de aquí alimenta las etiquetas de
 * artista, el comando de búsqueda `genre:` y las tarjetas de Buscar, así que
 * se puede añadir Drill o Amapiano sin desplegar nada.
 *
 * Un ritmo en uso no se puede borrar, sólo desactivar: borrarlo dejaría en
 * los perfiles de esos artistas un texto que ya no existe en el vocabulario
 * y que nadie podría volver a seleccionar. El backend lo impide y aquí se
 * avisa antes de que el admin lo intente.
 */
export function GenresPage() {
  const [genres, setGenres] = useState<MusicGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MusicGenre | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#1f6feb');

  const load = useCallback(() => {
    fetchGenres()
      .then((res) => {
        setGenres(res.genres);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los ritmos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusyId('nuevo');
    try {
      await createGenre({ name, color: newColor, position: genres.length });
      setNewName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el ritmo.');
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (genre: MusicGenre, data: Parameters<typeof updateGenre>[1]) => {
    setBusyId(genre.id);
    try {
      await updateGenre(genre.id, data);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (genre: MusicGenre) => {
    setBusyId(genre.id);
    try {
      await deleteGenre(genre.id);
      setPendingDelete(null);
      load();
    } catch (err) {
      // El backend rechaza borrar un ritmo en uso; el mensaje que devuelve
      // ya explica qué hacer, así que se muestra tal cual.
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
      setPendingDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell
      title="Ritmos musicales"
      subtitle="Vocabulario abierto: se pueden añadir Drill, Amapiano o Corridos Tumbados sin desplegar"
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-semibold text-muted">
          Nombre del ritmo
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Drill, Amapiano, Bachata…"
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Color de la tarjeta
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-[38px] w-16 cursor-pointer rounded-lg border border-white/15 bg-black/20"
          />
        </label>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newName.trim() || busyId === 'nuevo'}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          <Plus size={15} aria-hidden />
          Añadir
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : genres.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          Todavía no hay ritmos. Añadí el primero arriba.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {genres.map((genre) => (
            <div
              key={genre.id}
              className={`overflow-hidden rounded-xl border border-white/10 ${genre.isActive ? '' : 'opacity-50'}`}
            >
              <div className="h-16" style={{ backgroundColor: genre.color }} />
              <div className="bg-surface p-3">
                <p className="truncate text-sm font-bold">{genre.name}</p>
                <p className="truncate font-mono text-[11px] text-muted">
                  /{genre.slug} · {genre.artistCount} artista(s)
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="color"
                    value={genre.color}
                    onChange={(e) => patch(genre, { color: e.target.value })}
                    disabled={busyId === genre.id}
                    aria-label={`Color de ${genre.name}`}
                    className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => patch(genre, { isActive: !genre.isActive })}
                    disabled={busyId === genre.id}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      genre.isActive ? 'bg-brand/15 text-brand' : 'bg-white/10 text-muted'
                    }`}
                  >
                    {genre.isActive ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
                    {genre.isActive ? 'Activo' : 'Oculto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(genre)}
                    disabled={busyId === genre.id}
                    aria-label={`Eliminar ${genre.name}`}
                    title={
                      genre.artistCount > 0
                        ? `Lo usan ${genre.artistCount} artista(s): desactivalo en vez de borrarlo`
                        : 'Eliminar'
                    }
                    className="text-muted transition-colors hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar "${pendingDelete.name}"`}
          message={
            pendingDelete.artistCount > 0
              ? `Lo usan ${pendingDelete.artistCount} artista(s), así que el servidor va a rechazar el borrado. Usá "Oculto": deja de ofrecerse sin romper sus perfiles.`
              : 'Nadie usa este ritmo, se puede borrar sin consecuencias.'
          }
          confirmLabel="Eliminar ritmo"
          isSubmitting={busyId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}
    </AdminShell>
  );
}
