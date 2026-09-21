import { useEffect, useState } from 'react';
import { Palette, RotateCcw, Check } from 'lucide-react';
import {
  THEMES,
  applyTheme,
  readThemePreference,
  saveThemePreference,
  getTheme,
  DEFAULT_THEME_ID,
} from '../lib/themes';

/**
 * Selector de tema y color de acento del panel.
 *
 * El cambio es inmediato porque sólo reescribe variables CSS en el elemento
 * raíz; no hay recarga ni estado global que propagar. Se guarda en
 * `localStorage`, no en el servidor: es una preferencia de quien mira la
 * pantalla, no un ajuste de la plataforma, y sincronizarla obligaría a un
 * viaje a la API en cada arranque para pintar bien el primer render.
 */
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const initial = readThemePreference();
  const [themeId, setThemeId] = useState(initial.themeId);
  const [accent, setAccent] = useState(initial.accent);

  // Vista previa en vivo: aplica lo seleccionado mientras el diálogo está
  // abierto. Se guarda sólo al confirmar, y al cerrar sin confirmar se
  // restaura lo que había.
  useEffect(() => {
    applyTheme(themeId, accent);
  }, [themeId, accent]);

  const confirm = () => {
    saveThemePreference({ themeId, accent });
    onClose();
  };

  const cancel = () => {
    const saved = readThemePreference();
    applyTheme(saved.themeId, saved.accent);
    onClose();
  };

  const currentBrand = accent ?? getTheme(themeId).tokens.brand;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button type="button" aria-label="Cerrar" onClick={cancel} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apariencia del panel"
        className="relative w-full max-w-lg rounded-xl border border-white/15 bg-surface p-6 shadow-2xl"
      >
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Palette size={18} aria-hidden />
          Apariencia
        </h2>
        <p className="mt-1 text-sm text-muted">Los cambios se ven al instante. Se guardan sólo en este navegador.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeId(theme.id)}
              className={`overflow-hidden rounded-lg border text-left transition-colors ${
                themeId === theme.id ? 'border-brand' : 'border-white/10 hover:border-white/30'
              }`}
            >
              <div className="flex h-12">
                {theme.preview.map((color) => (
                  <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="flex items-start gap-2 p-3">
                <span aria-hidden>{theme.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{theme.label}</span>
                  <span className="block text-xs text-muted">{theme.description}</span>
                </span>
                {themeId === theme.id && <Check size={15} className="shrink-0 text-brand" aria-hidden />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <label className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            Color de acento
            <input
              type="color"
              value={currentBrand}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Elegir color de acento"
              className="h-9 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
            />
            <span className="font-mono text-xs font-normal text-muted">{currentBrand}</span>
            {accent && (
              <button
                type="button"
                onClick={() => setAccent(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
              >
                <RotateCcw size={12} aria-hidden />
                Usar el del tema
              </button>
            )}
          </label>
          <p className="mt-2 text-xs text-muted">
            Cambia los botones, el check de verificado y la barra de reproducción del panel. El tono de hover se calcula
            solo aclarando este color.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setThemeId(DEFAULT_THEME_ID);
              setAccent(null);
            }}
            className="rounded-full border border-white/25 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-white"
          >
            Restablecer
          </button>
          <button
            type="button"
            onClick={cancel}
            className="flex-1 rounded-full border border-white/25 py-2.5 text-sm font-semibold transition-colors hover:border-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 rounded-full bg-brand py-2.5 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
