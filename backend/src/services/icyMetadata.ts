/**
 * Peyma Music API — "Sonando ahora" de una radio (metadata ICY)
 *
 * Muchos streams de Icecast/Shoutcast anuncian, cada N bytes de audio, un
 * bloque de texto con el título que está sonando (`StreamTitle='...'`) si el
 * cliente pide la cabecera `Icy-MetaData: 1`. La app móvil lo lee gratis
 * porque `react-native-track-player` ya lo expone como evento nativo — pero
 * un `<audio>` de navegador NUNCA ve esa metadata (no es parte de HTML5
 * Audio), así que para la web hace falta que alguien más la lea por ella.
 *
 * Este servicio es ese "alguien": abre la conexión al stream, lee sólo lo
 * necesario para sacar el título y corta. Como se ejecuta en el SERVIDOR, no
 * en el navegador de cada oyente, y el cliente no manda la URL directa sino
 * sólo el id de la estación (ver `routes/radio.ts`), hay que blindarlo
 * contra SSRF: sin eso, esta ruta sería "hacé que mi backend le pegue a
 * cualquier IP que yo diga".
 */
import * as dns from 'node:dns';
import * as net from 'node:net';

const ICY_TIMEOUT_MS = 5000;
/** Techo de bytes a leer (audio descartado + bloque de metadata) — nunca la canción entera. */
const MAX_BYTES_READ = 256 * 1024;
const MAX_REDIRECTS = 3;

interface CacheEntry {
  title: string | null;
  expiresAt: number;
}
const CACHE_TTL_MS = 20_000;
const cache = new Map<string, CacheEntry>();

/** IPv4 en notación punteada → entero de 32 bits, para comparar contra rangos por máscara. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** Rangos privados/reservados de IPv4 (RFC 1918, loopback, link-local, CGNAT, multicast, etc.). */
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // No se pudo parsear: se trata como no confiable.
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (baseInt & mask);
  });
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (unique local)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
  // IPv4 mapeada en IPv6 (::ffff:a.b.c.d) — hay que revisar la IPv4 que lleva dentro.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

/** Resuelve el host y rechaza si CUALQUIERA de sus IPs es privada/reservada — así una respuesta DNS con varias A no cuela una IP interna entre IPs públicas. */
async function isPublicHostname(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) {
    return net.isIP(hostname) === 4 ? !isPrivateIpv4(hostname) : !isPrivateIpv6(hostname);
  }
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => (a.family === 4 ? !isPrivateIpv4(a.address) : !isPrivateIpv6(a.address)));
  } catch {
    return false;
  }
}

/** Parsea `StreamTitle='...';` (y opcionalmente `StreamUrl='...';`) del bloque de metadata ICY. */
function parseIcyTitle(block: string): string | null {
  const match = block.match(/StreamTitle=['"](.*?)['"];/);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : null;
}

/**
 * Sigue una URL de stream (con redirecciones manuales, revalidando SSRF en
 * cada salto) y devuelve el título ICY actual, o `null` si la estación no
 * anuncia metadata.
 */
async function fetchIcyTitleOnce(streamUrl: string): Promise<string | null> {
  let url = streamUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!(await isPublicHostname(parsed.hostname))) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ICY_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'Icy-MetaData': '1', 'User-Agent': 'PeymaMusic/1.0' },
      });
    } catch {
      clearTimeout(timeout);
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timeout);
      const location = res.headers.get('location');
      if (!location) return null;
      url = new URL(location, parsed).toString();
      continue;
    }

    const metaInt = Number(res.headers.get('icy-metaint'));
    if (!res.body || !Number.isInteger(metaInt) || metaInt <= 0) {
      clearTimeout(timeout);
      try {
        await res.body?.cancel();
      } catch {
        /* la conexión ya pudo cerrarse sola */
      }
      return null;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      // Sólo hace falta leer hasta pasar el primer bloque de audio
      // (`metaInt` bytes) más el bloque de metadata que le sigue — nunca la
      // canción entera. `MAX_BYTES_READ` es el techo absoluto por si un
      // servidor manda un `icy-metaint` absurdamente alto.
      const need = Math.min(metaInt + 1 + 255 * 16, MAX_BYTES_READ);
      while (total < need) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
    } finally {
      clearTimeout(timeout);
      void reader.cancel().catch(() => {});
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
    if (buffer.length <= metaInt) return null;

    const metaLengthByte = buffer[metaInt];
    if (metaLengthByte === undefined || metaLengthByte === 0) return null;
    const metaLength = metaLengthByte * 16;
    const metaBlock = buffer.subarray(metaInt + 1, metaInt + 1 + metaLength).toString('utf8');
    return parseIcyTitle(metaBlock);
  }

  return null;
}

/** Con caché corta: varios oyentes de la misma estación no deberían abrir una conexión cada uno cada pocos segundos. */
export async function getIcyNowPlaying(stationId: string, streamUrl: string): Promise<string | null> {
  const cached = cache.get(stationId);
  if (cached && cached.expiresAt > Date.now()) return cached.title;

  const title = await fetchIcyTitleOnce(streamUrl).catch(() => null);
  cache.set(stationId, { title, expiresAt: Date.now() + CACHE_TTL_MS });
  return title;
}
