import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LEGAL_DOCUMENTS, TERMS, PRIVACY, TERMS_UPDATED_LABEL, TERMS_VERSION } from "../../../lib/legal";

/**
 * Términos y privacidad, en una sola plantilla.
 *
 * Una ruta con `slug` y no dos páginas casi idénticas: los dos documentos
 * tienen la misma forma (título, fecha, secciones) y sólo cambia el
 * contenido, que vive en `lib/legal.ts`. Duplicar la plantilla garantizaría
 * que en unos meses una tenga el estilo nuevo y la otra no.
 *
 * Son páginas estáticas, sin sesión: quien está decidiendo si se registra
 * todavía no tiene cuenta y tiene que poder leerlas.
 */

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS[slug];
  if (!doc) return { title: "Peyma Music" };
  return { title: `${doc.title} — Peyma Music`, description: doc.summary };
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS[slug];
  if (!doc) notFound();

  const otro = doc.slug === TERMS.slug ? PRIVACY : TERMS;

  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80"
        style={{
          background: "radial-gradient(700px circle at 30% -20%, rgba(29,185,84,0.14), transparent 60%)",
        }}
      />

      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5 sm:px-8">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Peyma Music
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background transition-transform duration-300 hover:scale-105"
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      {/* `max-w-3xl`: una línea de texto legal a todo el ancho de la pantalla
          es ilegible. Se topa en una medida de lectura cómoda. */}
      <article className="mx-auto max-w-3xl px-6 py-14 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-muted">{doc.summary}</p>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Actualizado el {TERMS_UPDATED_LABEL}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">versión {TERMS_VERSION}</span>
        </p>

        {/* Índice: son documentos largos y quien los abre suele venir a por
            una sección concreta, no a leerlos enteros. */}
        <nav aria-label="Secciones" className="mt-10 rounded-2xl border border-white/10 bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">En esta página</p>
          <ol className="mt-3 flex flex-col gap-2">
            {doc.sections.map((section, indice) => (
              <li key={section.heading}>
                <a
                  href={`#seccion-${indice}`}
                  className="text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                  {indice + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 flex flex-col gap-10">
          {doc.sections.map((section, indice) => (
            <section key={section.heading} id={`seccion-${indice}`} className="scroll-mt-8">
              <h2 className="text-xl font-bold tracking-tight">
                {indice + 1}. {section.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {section.paragraphs.map((parrafo) => (
                  <p key={parrafo} className="leading-relaxed text-muted">
                    {parrafo}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
          <Link href={`/legal/${otro.slug}`} className="text-sm font-semibold transition-colors hover:text-brand">
            Leer también: {otro.title} →
          </Link>
          <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">
            Volver al inicio
          </Link>
        </div>
      </article>
    </main>
  );
}
