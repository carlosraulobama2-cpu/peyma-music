import { useCallback, useEffect, useState } from 'react';
import { Plus, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, LayoutList } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CoverImage } from '../components/CoverImage';
import {
  fetchSections,
  createSection,
  updateSection,
  deleteSection,
  previewSection,
  KIND_LABELS,
  LAYOUT_LABELS,
  type EditorialSection,
  type EditorialKind,
  type EditorialLayout,
  type ResolvedSection,
} from '../lib/editorial';

/**
 * Gestor de las secciones de la portada: "Lo nuevo", "Mola", "Los mejores
 * álbumes"…
 *
 * Lo que se define acá sale igual en la app móvil y en la web, porque las
 * dos piden el mismo `GET /editorial`. La vista previa de la derecha muestra
 * el contenido YA RESUELTO por el backend, no una maqueta: es literalmente
 * lo que van a recibir los clientes.
 */

/** Genera el slug a partir del título, con las mismas reglas que valida el backend. */
function slugify(title: string): string {
  return title
    .normalize('NFKD')
    // Quitar diacríticos: "Los mejores álbumes" → "los-mejores-albumes".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KINDS = Object.keys(KIND_LABELS) as EditorialKind[];
const LAYOUTS = Object.keys(LAYOUT_LABELS) as EditorialLayout[];

export function EditorialPage() {
  const [sections, setSections] = useState<EditorialSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EditorialSection | null>(null);
  const [preview, setPreview] = useState<ResolvedSection | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<EditorialKind>('NEW_RELEASES');

  // No pone `loading` en true: el estado ya arranca en true para la carga
  // inicial, y hacerlo dentro del efecto sería un setState síncrono que
  // dispara un render en cascada. En las recargas posteriores la lista
  // simplemente se reemplaza, sin parpadeo de esqueletos — que además es
  // mejor: reordenar una sección no debería hacer desaparecer la pantalla.
  const load = useCallback(() => {
    fetchSections()
      .then((res) => {
        setSections(res.sections);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las secciones.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusyId('nueva');
    try {
      await createSection({
        title,
        slug: slugify(title),
        kind: newKind,
        // Se crea al final para no desordenar la portada existente.
        position: sections.length,
        isPublished: false,
      });
      setNewTitle('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sección.');
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (section: EditorialSection, data: Parameters<typeof updateSection>[1]) => {
    setBusyId(section.id);
    try {
      await updateSection(section.id, data);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Mueve una sección intercambiando su `position` con la vecina.
   *
   * Se mandan las dos actualizaciones y sólo después se recarga: hacerlo al
   * revés dejaría un instante con dos secciones en la misma posición, y el
   * orden que devolviera el backend en ese momento sería arbitrario.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const current = sections[index];
    const neighbour = sections[index + direction];
    if (!current || !neighbour) return;

    setBusyId(current.id);
    try {
      await Promise.all([
        updateSection(current.id, { position: neighbour.position }),
        updateSection(neighbour.id, { position: current.position }),
      ]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reordenar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (section: EditorialSection) => {
    setBusyId(section.id);
    try {
      await deleteSection(section.id);
      setPendingDelete(null);
      if (preview?.id === section.id) setPreview(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = async (section: EditorialSection) => {
    setPreview(null);
    try {
      const res = await previewSection(section.id);
      setPreview(res.section);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa.');
    }
  };

  return (
    <AdminShell
      title="Secciones de la portada"
      subtitle="Lo que ven la app y la web al abrir Inicio. El orden de aquí es el orden de allí."
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-semibold text-muted">
          Nombre de la sección
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Lo nuevo, Mola, Los mejores álbumes…"
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Contenido
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as EditorialKind)}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newTitle.trim() || busyId === 'nueva'}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          <Plus size={15} aria-hidden />
          Crear
        </button>
        {newTitle.trim() && (
          <p className="w-full text-xs text-muted">
            Ruta: <span className="font-mono">/seccion/{slugify(newTitle)}</span>
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-3">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-white/10 bg-surface" />)
          ) : sections.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
              Todavía no hay secciones. Creá la primera arriba.
            </p>
          ) : (
            sections.map((section, index) => (
              <div key={section.id} className="rounded-xl border border-white/10 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || busyId === section.id}
                      aria-label="Subir"
                      className="text-muted transition-colors hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === sections.length - 1 || busyId === section.id}
                      aria-label="Bajar"
                      className="text-muted transition-colors hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-semibold">
                      {section.title}
                      {!section.isPublished && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
                          BORRADOR
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {KIND_LABELS[section.kind]} · {LAYOUT_LABELS[section.layout]} ·{' '}
                      <span className="font-mono">/{section.slug}</span>
                      {section.kind === 'MANUAL' && ` · ${section._count.items} pieza(s)`}
                    </p>
                  </div>

                  <select
                    value={section.layout}
                    onChange={(e) => patch(section, { layout: e.target.value as EditorialLayout })}
                    disabled={busyId === section.id}
                    aria-label="Disposición"
                    className="rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-brand"
                  >
                    {LAYOUTS.map((layout) => (
                      <option key={layout} value={layout}>
                        {LAYOUT_LABELS[layout]}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => openPreview(section)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white"
                  >
                    Vista previa
                  </button>

                  <button
                    type="button"
                    onClick={() => patch(section, { isPublished: !section.isPublished })}
                    disabled={busyId === section.id}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      section.isPublished ? 'bg-brand/15 text-brand' : 'bg-white/10 text-muted hover:text-foreground'
                    }`}
                  >
                    {section.isPublished ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
                    {section.isPublished ? 'Publicada' : 'Publicar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(section)}
                    aria-label={`Eliminar ${section.title}`}
                    className="text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <aside className="rounded-xl border border-white/10 bg-surface p-4 xl:sticky xl:top-8 xl:self-start">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <LayoutList size={15} aria-hidden />
            Vista previa
          </h2>
          {!preview ? (
            <p className="mt-6 text-center text-xs text-muted">
              Elegí &ldquo;Vista previa&rdquo; en una sección para ver exactamente lo que recibirán la app y la web.
            </p>
          ) : (
            <div className="mt-4">
              <p className="font-semibold">{preview.title}</p>
              {preview.subtitle && <p className="text-xs text-muted">{preview.subtitle}</p>}

              {(() => {
                const cards = [...preview.tracks, ...preview.albums, ...preview.artists];
                if (cards.length === 0) {
                  return (
                    <p className="mt-5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
                      Sin contenido. Las secciones vacías no se envían a los clientes.
                    </p>
                  );
                }
                return (
                  <ul className="mt-4 flex flex-col gap-2">
                    {cards.slice(0, 8).map((card) => (
                      <li key={card.id} className="flex items-center gap-2.5">
                        <CoverImage
                          src={card.coverUrl ?? card.imageUrl ?? ''}
                          alt={card.title ?? card.name ?? ''}
                          size={36}
                          rounded="rounded"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{card.title ?? card.name}</p>
                          {card.artist && <p className="truncate text-[11px] text-muted">{card.artist.name}</p>}
                        </div>
                      </li>
                    ))}
                    {cards.length > 8 && (
                      <li className="pt-1 text-center text-[11px] text-muted">y {cards.length - 8} más…</li>
                    )}
                  </ul>
                );
              })()}
            </div>
          )}
        </aside>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar "${pendingDelete.title}"`}
          message="La sección desaparece de la portada de la app y la web. No se borra ninguna canción ni álbum, sólo la agrupación."
          confirmLabel="Eliminar sección"
          isSubmitting={busyId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}
    </AdminShell>
  );
}
