/**
 * Peyma Music API — Ajustes de la plataforma
 *
 * Valores que un administrador puede cambiar sin desplegar. Viven en
 * `AppSetting` como clave-valor de texto y este módulo centraliza la
 * conversión de tipos: si cada lector hiciera su propio `Number(...)`, un
 * valor mal escrito rompería en un sitio distinto cada vez.
 *
 * El catálogo de ajustes (`SETTING_DEFINITIONS`) está en código, no en la
 * base. Es a propósito: un ajuste sin código que lo lea no hace nada, así
 * que permitir crear claves arbitrarias desde el panel sólo produciría
 * ajustes muertos que parecen funcionar.
 */
import { prisma } from '../prismaClient';

export type SettingType = 'boolean' | 'number' | 'string';

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: string;
  /** Para agrupar en la pantalla de Ajustes. */
  group: string;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'maintenance.enabled',
    label: 'Modo mantenimiento',
    description: 'Los clientes reciben un aviso y la API rechaza escrituras. La reproducción sigue funcionando.',
    type: 'boolean',
    defaultValue: 'false',
    group: 'Plataforma',
  },
  {
    key: 'maintenance.message',
    label: 'Mensaje de mantenimiento',
    description: 'Lo que se muestra a los usuarios mientras dure el mantenimiento.',
    type: 'string',
    defaultValue: 'Estamos haciendo mejoras. Volvemos en unos minutos.',
    group: 'Plataforma',
  },
  {
    key: 'moderation.autoApprove',
    label: 'Aprobar subidas automáticamente',
    description: 'Si se activa, las canciones que suban los artistas se publican sin pasar por la cola de revisión.',
    type: 'boolean',
    defaultValue: 'false',
    group: 'Moderación',
  },
  {
    key: 'audio.targetLufs',
    label: 'Objetivo de sonoridad (LUFS)',
    description: 'Volumen al que se normalizan todas las pistas en reproducción. El estándar de la industria es -14.',
    type: 'number',
    defaultValue: '-14',
    group: 'Audio',
  },
  {
    key: 'audio.truePeakCeilingDb',
    label: 'Techo de pico real (dBTP)',
    description: 'Margen que se deja para evitar recorte al codificar. Habitualmente -1.',
    type: 'number',
    defaultValue: '-1',
    group: 'Audio',
  },
  {
    key: 'analytics.windowDays',
    label: 'Ventana de métricas (días)',
    description: 'Periodo móvil de oyentes mensuales, tendencias y rotación de portadas.',
    type: 'number',
    defaultValue: '28',
    group: 'Analítica',
  },
  {
    key: 'search.logQueries',
    label: 'Registrar búsquedas',
    description: 'Guarda qué busca la gente para poder ver la demanda de catálogo. No guarda quién si está desactivado.',
    type: 'boolean',
    defaultValue: 'true',
    group: 'Analítica',
  },
  {
    key: 'uploads.maxAudioMb',
    label: 'Tamaño máximo de audio (MB)',
    description: 'Límite por archivo en el pipeline de subida.',
    type: 'number',
    defaultValue: '40',
    group: 'Subidas',
  },
] as const;

const DEFINITIONS_BY_KEY = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

export function isKnownSetting(key: string): boolean {
  return DEFINITIONS_BY_KEY.has(key);
}

/**
 * Cache en memoria.
 *
 * Los ajustes se leen en rutas calientes (cada subida consulta el límite de
 * tamaño) y cambian muy de vez en cuando. Sin cache, cada petición sumaría
 * un viaje a Postgres para leer una fila que casi nunca varía. El TTL es
 * corto para que un cambio desde el panel se note enseguida sin tener que
 * invalidar entre instancias.
 */
const CACHE_TTL_MS = 10_000;
let cache: { values: Map<string, string>; expiresAt: number } | null = null;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.values;

  const rows = await prisma.appSetting.findMany({ select: { key: true, value: true } });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  cache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
  return values;
}

/** Invalida la cache — la llama la ruta que escribe, para no esperar al TTL. */
export function invalidateSettingsCache(): void {
  cache = null;
}

async function raw(key: string): Promise<string> {
  const definition = DEFINITIONS_BY_KEY.get(key);
  if (!definition) throw new Error(`Ajuste desconocido: ${key}`);
  const values = await loadAll();
  return values.get(key) ?? definition.defaultValue;
}

export async function getBoolean(key: string): Promise<boolean> {
  return (await raw(key)) === 'true';
}

export async function getNumber(key: string): Promise<number> {
  const parsed = Number(await raw(key));
  // Un valor corrupto en la base no debe propagarse como NaN a un cálculo:
  // se cae al default, que siempre es válido.
  return Number.isFinite(parsed) ? parsed : Number(DEFINITIONS_BY_KEY.get(key)!.defaultValue);
}

export async function getString(key: string): Promise<string> {
  return raw(key);
}

export interface SettingView extends SettingDefinition {
  value: string;
  /** true si nunca se cambió y está usando el valor por defecto. */
  isDefault: boolean;
  updatedAt: Date | null;
}

/** Todos los ajustes con su valor efectivo — lo que pinta la pantalla de Ajustes. */
export async function listSettings(): Promise<SettingView[]> {
  const rows = await prisma.appSetting.findMany();
  const stored = new Map(rows.map((row) => [row.key, row]));

  return SETTING_DEFINITIONS.map((definition) => {
    const row = stored.get(definition.key);
    return {
      ...definition,
      value: row?.value ?? definition.defaultValue,
      isDefault: !row,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/** Valida el valor según el tipo declarado. Devuelve el error o null. */
export function validateSettingValue(key: string, value: string): string | null {
  const definition = DEFINITIONS_BY_KEY.get(key);
  if (!definition) return `Ajuste desconocido: ${key}`;

  if (definition.type === 'boolean' && value !== 'true' && value !== 'false') {
    return 'Tiene que ser "true" o "false"';
  }
  if (definition.type === 'number' && !Number.isFinite(Number(value))) {
    return 'Tiene que ser un número';
  }
  if (definition.type === 'string' && value.length > 500) {
    return 'Máximo 500 caracteres';
  }
  return null;
}

export async function setSetting(key: string, value: string, userId: string): Promise<void> {
  const definition = DEFINITIONS_BY_KEY.get(key);
  if (!definition) throw new Error(`Ajuste desconocido: ${key}`);

  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, description: definition.description, updatedById: userId },
    update: { value, updatedById: userId },
  });
  invalidateSettingsCache();
}
