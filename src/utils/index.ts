/**
 * Peyma Music — Utilidades puras (sin dependencias de React ni de RN)
 */

/** Segundos → `m:ss`, o `h:mm:ss` si pasa de la hora. Tolera NaN/negativos. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Duración larga y legible: `3 h 12 min`, `10 min`, `45 s`. */
export function formatTotalDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  if (seconds < 60) return `${Math.round(seconds)} s`;

  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

/** 1250000 → `1,25M`. Usa separador decimal español. */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  const abs = Math.abs(num);
  const withComma = (value: number, digits: number) =>
    value.toFixed(digits).replace('.', ',').replace(/,0+$/, '');

  if (abs >= 1_000_000_000) return `${withComma(num / 1_000_000_000, 2)}MM`;
  if (abs >= 1_000_000) return `${withComma(num / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${withComma(num / 1_000, 1)}K`;
  return Math.round(num).toString();
}

/** Saludo según la hora local. */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Ícono que acompaña al saludo — el mismo corte horario que `getGreeting()`, para que nunca queden desincronizados. */
export function getGreetingIcon(): 'moon' | 'partly-sunny' | 'sunny' {
  const hour = new Date().getHours();
  if (hour < 6) return 'moon';
  if (hour < 12) return 'partly-sunny';
  if (hour < 20) return 'sunny';
  return 'moon';
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Iniciales para avatares: "Ana Pérez López" → "AP". */
export function getInitials(name: string, max = 2): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, max)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * Fisher–Yates. El `sort(() => Math.random() - 0.5)` que había antes produce
 * una distribución sesgada y su resultado depende del algoritmo del motor.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Suma de duraciones de una lista de pistas, en segundos. */
export function sumDuration(tracks: readonly { duration: number }[]): number {
  return tracks.reduce((total, t) => total + (Number.isFinite(t.duration) ? t.duration : 0), 0);
}

/** Espera `ms`. Útil en reintentos con backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
