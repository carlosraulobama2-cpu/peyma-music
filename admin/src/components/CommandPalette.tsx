import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAV_SECTIONS } from '../lib/navigation';
import { http } from '../lib/httpClient';

/**
 * Paleta de comandos (Ctrl/Cmd + K).
 *
 * Busca dos cosas a la vez: las secciones del panel (locales, instantáneas)
 * y el catálogo real vía la API, con rebote de 200 ms para no disparar una
 * consulta por tecla.
 *
 * Este componente SÓLO se monta cuando la paleta está abierta — el shell lo
 * renderiza condicionalmente. Así el estado (texto, resultados, selección)
 * se reinicia solo al cerrar, en vez de tener que limpiarlo a mano desde un
 * efecto, que dispararía un render en cascada cada vez.
 *
 * El atajo de teclado vive en el shell, no acá, justamente porque tiene que
 * funcionar cuando este componente no está montado.
 */

interface CommandPaletteProps {
  onClose: () => void;
}

interface TrackHit {
  id: string;
  title: string;
  artist: { id: string; name: string };
}

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;
const MIN_SEARCH_LENGTH = 2;

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TrackHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim();
  const isSearching = term.length >= MIN_SEARCH_LENGTH;

  // Enfocar al montar. Es sincronización con el DOM, no estado de React.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Búsqueda en el catálogo. El `cancelled` evita que una respuesta lenta de
  // una consulta vieja llegue después de una rápida y pise resultados nuevos.
  useEffect(() => {
    if (term.length < MIN_SEARCH_LENGTH) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      http
        .get<{ tracks: TrackHit[] }>(`/tracks?limit=6&search=${encodeURIComponent(term)}`)
        .then((res) => {
          if (!cancelled) setHits(res.tracks);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const lower = term.toLowerCase();

  // Los resultados del catálogo se DERIVAN de si hay término de búsqueda, en
  // vez de vaciarse con un setState en el efecto: al borrar el texto
  // desaparecen solos, sin un render extra.
  const tracks = isSearching ? hits : [];

  const commands: Command[] = [
    ...NAV_SECTIONS.filter(
      (section) =>
        !lower || section.label.toLowerCase().includes(lower) || section.description.toLowerCase().includes(lower),
    ).map((section) => ({
      id: `nav:${section.to}`,
      label: section.label,
      hint: section.description,
      run: () => {
        navigate(section.to);
        onClose();
      },
    })),
    ...tracks.map((track) => ({
      id: `track:${track.id}`,
      label: track.title,
      hint: `Canción · ${track.artist.name}`,
      run: () => {
        navigate(`/jobs?track=${track.id}`);
        onClose();
      },
    })),
  ];

  // El índice activo puede quedar fuera de rango cuando la lista se acorta al
  // escribir. Se recorta al renderizar y no con un efecto, que causaría un
  // render extra y un parpadeo.
  const safeIndex = commands.length === 0 ? 0 : Math.min(activeIndex, commands.length - 1);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (commands.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeIndex + 1) % commands.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((safeIndex - 1 + commands.length) % commands.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commands[safeIndex]?.run();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Cerrar paleta de comandos"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search size={17} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar secciones, canciones, artistas…"
            className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-muted"
          />
          <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            Esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-2">
          {commands.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">
              {isSearching ? 'Sin resultados.' : `Escribe al menos ${MIN_SEARCH_LENGTH} caracteres para buscar en el catálogo.`}
            </li>
          )}
          {commands.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={command.run}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  index === safeIndex ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{command.label}</span>
                <span className="shrink-0 text-xs text-muted">{command.hint}</span>
                {index === safeIndex && <CornerDownLeft size={13} className="shrink-0 text-muted" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
