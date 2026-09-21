import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { fetchSettings, updateSetting, type AppSetting } from '../lib/audience';

/**
 * Ajustes de la plataforma.
 *
 * El catálogo de ajustes lo define el backend (`SETTING_DEFINITIONS`), no
 * esta pantalla: así no se puede crear desde aquí una clave que ningún
 * código lea, que parecería funcionar y no haría nada.
 *
 * Cada ajuste se guarda al perder el foco (o al pulsar Enter) en vez de con
 * un botón "Guardar todo": con un solo botón, un valor inválido bloquearía
 * el guardado de los demás y no quedaría claro cuál falló.
 */
export function SettingsPage() {
  const [settings, setSettings] = useState<AppSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings()
      .then((res) => setSettings(res.settings))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los ajustes.'));
  }, []);

  const save = async (key: string, value: string) => {
    setError(null);
    try {
      const res = await updateSetting(key, value);
      setSettings(res.settings);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSavedKey(key);
      // El aviso de "guardado" se borra solo; dejarlo fijo haría creer que
      // sigue habiendo algo pendiente.
      setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  };

  const groups = settings
    ? [...new Set(settings.map((setting) => setting.group))].map((group) => ({
        group,
        items: settings.filter((setting) => setting.group === group),
      }))
    : [];

  return (
    <AdminShell title="Ajustes" subtitle="Valores de plataforma que se cambian sin desplegar">
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!settings ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-8">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{group}</h2>
              <div className="flex flex-col gap-3">
                {items.map((setting) => {
                  const draft = drafts[setting.key];
                  const current = draft ?? setting.value;
                  const isDirty = draft !== undefined && draft !== setting.value;

                  return (
                    <div key={setting.key} className="rounded-xl border border-white/10 bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-semibold">
                            {setting.label}
                            {setting.isDefault && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
                                POR DEFECTO
                              </span>
                            )}
                            {savedKey === setting.key && (
                              <span className="text-[11px] font-bold text-brand">guardado</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{setting.description}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted">{setting.key}</p>
                        </div>

                        {/* Columna de control de ancho fijo y alineada a la
                            derecha: si no, "Activado" y "Desactivado" (y los
                            ajustes con o sin botón de restablecer) dejaban
                            cada control en un sitio distinto. */}
                        <div className="flex w-64 shrink-0 items-center justify-end gap-2">
                          {setting.type === 'boolean' ? (
                            <button
                              type="button"
                              onClick={() => save(setting.key, setting.value === 'true' ? 'false' : 'true')}
                              className={`w-28 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                                setting.value === 'true' ? 'bg-brand text-black' : 'bg-white/10 text-muted'
                              }`}
                            >
                              {setting.value === 'true' ? 'Activado' : 'Desactivado'}
                            </button>
                          ) : (
                            <>
                              <input
                                type={setting.type === 'number' ? 'number' : 'text'}
                                value={current}
                                onChange={(e) => setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                                onBlur={() => isDirty && save(setting.key, current)}
                                onKeyDown={(e) => e.key === 'Enter' && isDirty && save(setting.key, current)}
                                className={`w-48 rounded-lg border bg-black/20 px-3 py-1.5 text-sm outline-none ${
                                  isDirty ? 'border-brand' : 'border-white/15 focus:border-brand'
                                }`}
                              />
                              {/* El hueco se reserva siempre: un ajuste ya en
                                  su valor por defecto no muestra el botón,
                                  pero su campo tiene que quedar a la misma
                                  altura horizontal que los demás. */}
                              <span className="flex w-5 shrink-0 justify-center">
                                {!setting.isDefault && (
                                  <button
                                    type="button"
                                    onClick={() => save(setting.key, setting.defaultValue)}
                                    title={`Volver al valor por defecto (${setting.defaultValue})`}
                                    className="text-muted transition-colors hover:text-foreground"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
