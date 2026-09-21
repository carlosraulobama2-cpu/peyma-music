import Link from "next/link";

const FEATURES = [
  {
    title: "Millones de canciones",
    description: "Descubre música nueva cada día, curada para tu forma de escuchar.",
  },
  {
    title: "Playlists que te conocen",
    description: "Mezclas generadas a partir de tu ritmo y estilo favoritos, siempre actualizadas.",
  },
  {
    title: "Sube tu propia música",
    description: "Si haces música, publícala y llega a oyentes reales — sin intermediarios.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative flex-1 flex flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(800px circle at 20% -10%, rgba(29,185,84,0.18), transparent 55%), radial-gradient(600px circle at 90% 20%, rgba(29,185,84,0.1), transparent 55%)",
        }}
      />

      <header className="sticky top-0 z-[100] flex items-center justify-between border-b border-white/5 bg-background/60 px-6 py-5 backdrop-blur-xl sm:px-10">
        <span className="text-xl font-bold tracking-tight">Peyma Music</span>
        <nav className="flex items-center gap-4">
          <Link
            href="/register"
            className="hidden sm:inline-block text-sm font-semibold text-muted hover:text-foreground transition-colors"
          >
            Regístrate
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-all duration-300 ease-in-out hover:scale-105"
          >
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 sm:py-28">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl text-balance">
          La música que quieres, en cualquier lugar
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted text-balance">
          Millones de canciones y podcasts, gratis en Peyma Music. Sin tarjeta de crédito.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto rounded-full bg-brand px-10 py-3.5 text-base font-bold text-black hover:bg-brand-hover hover:scale-105 transition-all"
          >
            Regístrate gratis
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto rounded-full border border-white/30 px-10 py-3.5 text-base font-bold hover:border-white transition-colors"
          >
            Ya tengo una cuenta
          </Link>
        </div>
      </section>

      <section className="px-6 pb-24 sm:px-10">
        <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/5 bg-surface p-8 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:border-brand/30 hover:shadow-[0_0_30px_-10px_rgba(29,185,84,0.4)]"
            >
              <h2 className="text-lg font-bold">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-muted sm:px-10">
        © {new Date().getFullYear()} Peyma Music
      </footer>
    </main>
  );
}
