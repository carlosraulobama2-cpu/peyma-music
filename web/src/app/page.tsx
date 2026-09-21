import Link from "next/link";
import type { Metadata } from "next";
import { fetchLandingShowcase, type LandingArtist, type LandingTrack } from "../lib/landing";

/**
 * Portada pública — lo que ve alguien que todavía no tiene cuenta.
 *
 * Es un Server Component y pide el catálogo real (`GET /api/home`, que es
 * público) en vez de enseñar tres tarjetas de texto genérico. La razón no es
 * estética: en una plataforma de música independiente, el catálogo ES el
 * argumento de venta. Quien llega quiere ver si está la música que le
 * interesa, y una promesa de "millones de canciones" no responde a eso —
 * además de ser falsa acá.
 *
 * Todo lo que depende del backend está detrás de un `if`: si la API no
 * contesta (ver `lib/landing.ts`), se cae la vitrina y quedan la propuesta,
 * los botones y el pie. La página de entrada nunca debería romperse porque
 * la base de datos esté lenta.
 */

export const metadata: Metadata = {
  title: "Peyma Music — Escuchá y publicá música independiente",
  description:
    "Descubrí artistas independientes, armá tus playlists y publicá tu propia música. Gratis y sin intermediarios.",
};

/** Se regenera sola; no hay nada por usuario en esta página. */
export const revalidate = 300;

const VENTAJAS = [
  {
    titulo: "Escuchá gratis, sin tarjeta",
    descripcion:
      "Catálogo completo, playlists propias y cola de reproducción. No pedimos datos de pago para empezar.",
  },
  {
    titulo: "Publicá tu música vos mismo",
    descripcion:
      "Subís el máster, se analiza el ritmo y la sonoridad, y queda en revisión. Sin sello ni distribuidora de por medio.",
  },
  {
    titulo: "Se sigue escuchando donde vayas",
    descripcion:
      "La cola, los me gusta y el punto exacto de la canción viajan entre el navegador y la app del teléfono.",
  },
];

function formatearOyentes(valor: number): string {
  return new Intl.NumberFormat("es").format(valor);
}

/**
 * Portada de una pieza del catálogo.
 *
 * `<img>` y no `next/image` a propósito, igual que en `CoverImage`: las
 * portadas salen del backend (disco local en desarrollo, bucket en
 * producción) y no hay un dominio fijo que declarar en `remotePatterns`.
 */
function Cover({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface-raised ${className}`} aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-muted/60">
          <path
            d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- portadas del backend, sin dominio fijo para next/image
    <img src={src} alt={alt} loading="lazy" decoding="async" className={`bg-surface-raised object-cover ${className}`} />
  );
}

function VerificadoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Artista verificado" role="img">
      <path d="M12 2l2.4 1.8 3-.3 1 2.8 2.6 1.5-1 2.8 1 2.8-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l1-2.8-1-2.8 2.6-1.5 1-2.8 3 .3L12 2z" />
      <path d="M10.8 14.9l-2.5-2.5 1.1-1.1 1.4 1.4 3.8-3.8 1.1 1.1-4.9 4.9z" fill="var(--background)" />
    </svg>
  );
}

/**
 * Cinta de portadas del hero.
 *
 * La tira se duplica (`aria-hidden` en la copia) porque el bucle CSS mueve
 * el contenedor media anchura: sin la copia se vería el hueco al reiniciar.
 * La duración crece con el número de portadas para que la velocidad
 * aparente sea la misma con 8 que con 24.
 */
function CoverMarquee({ tracks }: { tracks: LandingTrack[] }) {
  if (tracks.length === 0) return null;

  const tira = [...tracks, ...tracks];
  const duracion = `${Math.max(30, tracks.length * 5)}s`;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        // Se desvanece en los bordes en vez de cortar en seco: así la cinta
        // se lee como que sigue, no como que se acaba ahí.
        maskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <div className="marquee-track flex gap-4" style={{ "--marquee-duration": duracion } as React.CSSProperties}>
        {tira.map((track, indice) => (
          <div
            key={`${track.id}-${indice}`}
            aria-hidden={indice >= tracks.length}
            className="w-32 shrink-0 sm:w-40"
          >
            <Cover
              src={track.coverUrl}
              alt={`Portada de ${track.title}`}
              className="aspect-square w-full rounded-xl shadow-lg shadow-black/40"
            />
            <p className="mt-2 truncate text-xs font-semibold">{track.title}</p>
            <p className="truncate text-xs text-muted">{track.artist.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackCard({ track, posicion }: { track: LandingTrack; posicion: number }) {
  return (
    <li className="group relative flex items-center gap-4 rounded-xl border border-white/5 bg-surface p-3 transition-colors hover:border-white/15 hover:bg-surface-raised">
      <span className="w-5 shrink-0 text-right font-mono text-sm text-muted tabular-nums">{posicion}</span>
      <Cover src={track.coverUrl} alt={`Portada de ${track.title}`} className="size-14 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{track.title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          <span className="truncate">{track.artist.name}</span>
          {track.artist.isVerified && <VerificadoIcon className="size-3 shrink-0 text-sky-400" />}
        </p>
      </div>
      {track.genre && (
        <span className="hidden shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-muted sm:block">
          {track.genre}
        </span>
      )}
      {/* El enlace cubre toda la tarjeta (`after:absolute inset-0`) para que
          el área clicable sea la fila entera y no sólo el texto. */}
      <Link
        href="/register"
        className="shrink-0 rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-bold transition-colors after:absolute after:inset-0 group-hover:border-white"
      >
        Escuchar
        <span className="sr-only"> {track.title}</span>
      </Link>
    </li>
  );
}

function ArtistChip({ artist }: { artist: LandingArtist }) {
  return (
    <li className="w-28 shrink-0 text-center sm:w-32">
      <Cover
        src={artist.imageUrl}
        alt={`Foto de ${artist.name}`}
        className="mx-auto aspect-square w-full rounded-full"
      />
      <p className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold">
        <span className="truncate">{artist.name}</span>
        {artist.isVerified && <VerificadoIcon className="size-3.5 shrink-0 text-sky-400" />}
      </p>
      {artist.listeners > 0 && (
        <p className="text-xs text-muted">{formatearOyentes(artist.listeners)} oyentes</p>
      )}
    </li>
  );
}

export default async function LandingPage() {
  const { tracks, artists } = await fetchLandingShowcase();

  const destacadas = tracks.slice(0, 6);
  const paraCinta = tracks.slice(0, 14);
  const artistasVisibles = artists.slice(0, 10);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px]"
        style={{
          background:
            "radial-gradient(900px circle at 15% -5%, rgba(29,185,84,0.2), transparent 55%), radial-gradient(700px circle at 85% 10%, rgba(29,185,84,0.09), transparent 55%)",
        }}
      />

      <header className="sticky top-0 z-[100] border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <span className="text-xl font-bold tracking-tight">Peyma Music</span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/register"
              className="hidden text-sm font-semibold text-muted transition-colors hover:text-foreground sm:inline-block"
            >
              Registrate
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-transform duration-300 ease-in-out hover:scale-105 sm:px-6"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------------
          Hero. En escritorio va a dos columnas para que la cinta de portadas
          se vea sin desplazar; apilado en móvil, donde una columna estrecha
          con imagen al lado no entra.
      ------------------------------------------------------------------ */}
      {/* `minmax(0,1fr)` en la segunda columna, no `1fr` a secas: la cinta de
          portadas mide `max-content` (es una tira larguísima) y una pista
          `1fr` tiene mínimo `auto`, así que la columna crecía hasta caber la
          tira entera y dejaba el titular en una tira de texto de 250 px. */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_minmax(0,1fr)]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
            Música independiente
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
            La música de acá, sonando en todos lados
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted text-balance">
            Descubrí artistas independientes, armá tus playlists y llevátelas al teléfono. Y si hacés música, publicala
            vos mismo: sin sello, sin distribuidora y sin esperar meses.
          </p>

          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {/* `whitespace-nowrap`: una llamada a la acción partida en dos
                renglones dentro de una píldora se lee como un error. */}
            <Link
              href="/register"
              className="whitespace-nowrap rounded-full bg-brand px-9 py-3.5 text-center text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover"
            >
              Registrate gratis
            </Link>
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-white/25 px-9 py-3.5 text-center text-base font-bold transition-colors hover:border-white"
            >
              Ya tengo cuenta
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted">Gratis para siempre. No pedimos tarjeta de crédito.</p>
        </div>

        {/* Sin catálogo no se dibuja una caja vacía: el hero se queda a una
            columna y no se nota que falta nada. */}
        {paraCinta.length > 0 && (
          <div className="min-w-0 lg:-mr-16">
            <CoverMarquee tracks={paraCinta} />
          </div>
        )}
      </section>

      {destacadas.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Lo que más se escucha ahora</h2>
              <p className="mt-1 text-sm text-muted">Del catálogo real, actualizado cada pocos minutos.</p>
            </div>
            <Link href="/register" className="text-sm font-semibold text-muted transition-colors hover:text-foreground">
              Ver todo el catálogo →
            </Link>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {destacadas.map((track, indice) => (
              <TrackCard key={track.id} track={track} posicion={indice + 1} />
            ))}
          </ul>
        </section>
      )}

      {artistasVisibles.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
          <h2 className="text-2xl font-bold tracking-tight">Artistas en Peyma</h2>
          <p className="mt-1 text-sm text-muted">Gente que publica su música acá.</p>

          {/* Carrusel por desbordamiento y no cuadrícula: con pocos artistas
              una grilla deja huecos, y con muchos obliga a crecer la página. */}
          <ul className="no-scrollbar mt-6 flex gap-6 overflow-x-auto pb-2">
            {artistasVisibles.map((artist) => (
              <ArtistChip key={artist.id} artist={artist} />
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
        <div className="grid gap-5 sm:grid-cols-3">
          {VENTAJAS.map((ventaja) => (
            <div
              key={ventaja.titulo}
              className="rounded-2xl border border-white/5 bg-surface p-7 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:border-brand/30 hover:shadow-[0_0_30px_-10px_rgba(29,185,84,0.4)]"
            >
              <h3 className="text-lg font-bold">{ventaja.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{ventaja.descripcion}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand/20 via-surface to-surface p-10 text-center sm:p-14">
          <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            ¿Hacés música? Publicala hoy mismo
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted text-balance">
            Creá tu cuenta, subí el máster y quedará disponible para todos los oyentes en cuanto pase la revisión.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-full bg-brand px-10 py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover"
          >
            Crear mi cuenta
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-muted sm:flex-row sm:px-8">
          <span>© {new Date().getFullYear()} Peyma Music</span>
          <nav className="flex items-center gap-6">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Iniciar sesión
            </Link>
            <Link href="/register" className="transition-colors hover:text-foreground">
              Crear cuenta
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
