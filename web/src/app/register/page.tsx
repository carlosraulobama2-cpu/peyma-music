"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthProvider";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { http } from "../../lib/httpClient";
import { evaluatePassword, MIN_PASSWORD_LENGTH } from "../../lib/passwordStrength";
import { PRIVACY, TERMS, TERMS_VERSION } from "../../lib/legal";

/**
 * Alta de cuenta, en pasos.
 *
 * Por qué no un único formulario con cinco campos: lo que antes había era
 * eso, y pedía nombre, correo y contraseña de golpe sin decir nada sobre la
 * contraseña hasta que el backend la rechazaba. Partirlo permite (a) validar
 * cada cosa en el momento, (b) explicar por qué se pide cada dato y (c)
 * recoger los géneros favoritos, que el backend acepta desde siempre y la
 * web nunca llegó a enviar — la app sí los pedía, así que quien se
 * registraba desde el navegador arrancaba sin recomendaciones.
 *
 * El último paso es la aceptación de términos y privacidad. No es sólo una
 * casilla: el servidor la exige (`registerSchema`) y guarda qué versión se
 * aceptó y cuándo. Ver `backend/src/legal.ts`.
 */

type StepId = "email" | "password" | "name" | "taste" | "terms";

const STEPS: { id: StepId; label: string }[] = [
  { id: "email", label: "Correo" },
  { id: "password", label: "Contraseña" },
  { id: "name", label: "Nombre" },
  { id: "taste", label: "Gustos" },
  { id: "terms", label: "Listo" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Cuántos géneros hacen falta para que la recomendación sirva de algo. */
const MIN_GENRES = 0;
const MAX_GENRES = 20;

interface GenreCard {
  id: string;
  label: string;
  color: string;
  coverUrl: string | null;
  trackCount: number;
}

/**
 * Color estable a partir del nombre, para el avatar de iniciales.
 *
 * Determinista: la misma persona ve siempre el mismo color, en vez de uno
 * distinto en cada render.
 */
function colorDesdeNombre(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 360;
  return `hsl(${hash}, 62%, 42%)`;
}

function iniciales(nombre: string, email: string): string {
  const base = nombre.trim() || email.trim();
  if (!base) return "?";
  const partes = base.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return (partes.slice(0, 2).map((p) => p[0]).join("") || base[0] || "?").toUpperCase();
}

const COLOR_BARRA = ["bg-danger", "bg-danger", "bg-amber-400", "bg-brand", "bg-brand"];

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithGoogle, isSubmitting, user, isLoading } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!.id;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [genres, setGenres] = useState<GenreCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);

  /**
   * Los géneros salen del catálogo real (`GET /api/genres`, público), no de
   * una lista escrita a mano: una lista fija acaba ofreciendo estilos que
   * no tienen ni una canción, y dejando fuera los que sí. Se piden al
   * entrar al paso de contraseña para que ya estén cuando se llegue al de
   * gustos, sin que se vea un hueco cargando.
   */
  useEffect(() => {
    if (stepIndex < 1 || genres.length > 0) return;
    let cancelado = false;
    http
      .get<{ genres: GenreCard[] }>("/genres")
      .then((res) => {
        if (!cancelado) setGenres(res.genres.slice(0, 24));
      })
      .catch(() => {
        // Sin géneros el paso se salta solo (ver más abajo). No es un error
        // que deba interrumpir un alta.
      });
    return () => {
      cancelado = true;
    };
  }, [stepIndex, genres.length]);

  const strength = useMemo(() => evaluatePassword(password, { email, displayName }), [password, email, displayName]);

  const emailValido = EMAIL_PATTERN.test(email.trim());
  const nombreValido = displayName.trim().length >= 2;
  const passwordValida = password.length >= MIN_PASSWORD_LENGTH;

  const puedeAvanzar =
    (step === "email" && emailValido) ||
    (step === "password" && passwordValida) ||
    (step === "name" && nombreValido) ||
    step === "taste" ||
    (step === "terms" && aceptaTerminos);

  const avanzar = useCallback(() => {
    setError(null);
    setStepIndex((i) => {
      let siguiente = i + 1;
      // Si el catálogo no devolvió géneros, el paso de gustos no tiene nada
      // que enseñar: se salta en vez de mostrar una cuadrícula vacía.
      if (STEPS[siguiente]?.id === "taste" && genres.length === 0) siguiente += 1;
      return Math.min(STEPS.length - 1, siguiente);
    });
  }, [genres.length]);

  const retroceder = () => {
    setError(null);
    setStepIndex((i) => {
      let anterior = i - 1;
      if (STEPS[anterior]?.id === "taste" && genres.length === 0) anterior -= 1;
      return Math.max(0, anterior);
    });
  };

  const alternarGenero = (label: string) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : prev.length >= MAX_GENRES ? prev : [...prev, label],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!puedeAvanzar) return;
    if (step !== "terms") {
      avanzar();
      return;
    }

    setError(null);
    try {
      await register({
        email,
        password,
        displayName,
        favoriteGenres: selected,
        acceptedTerms: aceptaTerminos,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    }
  };

  /**
   * Alta con Google.
   *
   * Se manda `acceptedTerms` porque esto es la pantalla de registro y la
   * casilla está a la vista, junto al botón. Sin marcarla, el botón está
   * deshabilitado: crear la cuenta por la vía de Google no puede saltarse
   * un requisito que la vía del correo sí tiene.
   */
  const handleGoogleToken = async (idToken: string) => {
    setError(null);
    try {
      await loginWithGoogle(idToken, true);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo continuar con Google.");
    }
  };

  const acento = useMemo(() => {
    const primero = genres.find((g) => g.label === selected[0]);
    return primero?.color ?? "#1db954";
  }, [genres, selected]);

  return (
    <main className="relative flex flex-1 flex-col lg:flex-row">
      {/* ----------------------------------------------------------------
          Vista previa de la cuenta. Se arma sola mientras se completan los
          pasos: quien se registra ve QUÉ está creando, no una barra de
          progreso abstracta. El degradado toma el color del primer género
          elegido, así que la pantalla reacciona a datos reales del catálogo.
      ---------------------------------------------------------------- */}
      <aside className="relative hidden flex-1 items-center justify-center overflow-hidden border-r border-white/5 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-700"
          style={{
            background: `radial-gradient(650px circle at 30% 10%, ${acento}33, transparent 60%), radial-gradient(500px circle at 80% 90%, ${acento}1a, transparent 60%)`,
          }}
        />

        <div className="w-full max-w-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Tu cuenta</p>

          <div className="mt-5 rounded-3xl border border-white/10 bg-surface/70 p-7 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div
                className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-extrabold transition-colors duration-500"
                style={{ background: displayName.trim() ? colorDesdeNombre(displayName.trim()) : "rgba(255,255,255,0.08)" }}
              >
                {iniciales(displayName, email)}
              </div>
              <div className="min-w-0">
                <p className={`truncate text-lg font-bold ${displayName.trim() ? "" : "text-muted"}`}>
                  {displayName.trim() || "Tu nombre"}
                </p>
                <p className={`truncate text-sm ${email.trim() ? "text-muted" : "text-muted/50"}`}>
                  {email.trim() || "tu@correo.com"}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold text-muted">Te gusta escuchar</p>
              {selected.length === 0 ? (
                <p className="mt-2 text-sm text-muted/60">Todavía nada elegido.</p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {selected.map((label) => {
                    const genero = genres.find((g) => g.label === label);
                    return (
                      <span
                        key={label}
                        className="rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ background: `${genero?.color ?? "#1db954"}26`, color: genero?.color ?? "#1db954" }}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <ul className="mt-7 flex flex-col gap-2.5">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    i < stepIndex ? "bg-brand text-black" : i === stepIndex ? "border border-brand text-brand" : "border border-white/20 text-muted"
                  }`}
                >
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                <span className={i <= stepIndex ? "font-semibold" : "text-muted"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ----------------------------------------------------------------
          Formulario.
      ---------------------------------------------------------------- */}
      <section className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Peyma Music
            </Link>
            <span className="text-xs font-semibold text-muted">
              Paso {stepIndex + 1} de {STEPS.length}
            </span>
          </div>

          {/* Barra de progreso, también en móvil donde la columna izquierda
              no existe: sin ella no habría forma de saber cuánto falta. */}
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= stepIndex ? "bg-brand" : "bg-white/10"}`}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-9">
            {step === "email" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">Empezá con tu correo</h1>
                <p className="mt-2 text-sm text-muted">Lo usamos para entrar y para avisarte de algo importante. Nada de publicidad.</p>

                <label className="mt-7 flex flex-col gap-2 text-sm font-semibold">
                  Correo electrónico
                  <input
                    type="email"
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    aria-invalid={email.length > 0 && !emailValido}
                    className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
                  />
                </label>
                {email.length > 0 && !emailValido && (
                  <p className="mt-2 text-xs text-amber-400">Revisá el correo: falta la arroba o el dominio.</p>
                )}

                <div className="my-7 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-semibold text-muted">o creá la cuenta con</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* La casilla va ANTES del botón de Google y lo bloquea: por
                    esa vía la cuenta se crea de una, sin pasar por el resto
                    de los pasos, así que es el único sitio donde se puede
                    pedir el consentimiento. */}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-surface p-3.5">
                  <input
                    type="checkbox"
                    checked={aceptaTerminos}
                    onChange={(e) => setAceptaTerminos(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="text-xs leading-relaxed text-muted">
                    Acepto los{" "}
                    <Link href={`/legal/${TERMS.slug}`} target="_blank" className="font-semibold text-foreground underline">
                      términos de servicio
                    </Link>{" "}
                    y la{" "}
                    <Link href={`/legal/${PRIVACY.slug}`} target="_blank" className="font-semibold text-foreground underline">
                      política de privacidad
                    </Link>
                    .
                  </span>
                </label>

                <div className={`mt-3 ${aceptaTerminos ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!aceptaTerminos}>
                  <GoogleSignInButton onIdToken={handleGoogleToken} onError={setError} />
                </div>
              </>
            )}

            {step === "password" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">Elegí una contraseña</h1>
                <p className="mt-2 text-sm text-muted">
                  El único requisito son {MIN_PASSWORD_LENGTH} caracteres. Lo de abajo son consejos, no reglas.
                </p>

                <label className="mt-7 flex flex-col gap-2 text-sm font-semibold">
                  Contraseña
                  <div className="relative">
                    <input
                      type={verPassword ? "text" : "password"}
                      autoFocus
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Una frase que recuerdes"
                      className="w-full rounded-lg border border-white/15 bg-black/25 py-3 pl-4 pr-12 text-sm font-normal outline-none transition-colors focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setVerPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={verPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                      className="absolute inset-y-0 right-0 w-12 text-xs font-bold text-muted transition-colors hover:text-foreground"
                    >
                      {verPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </label>

                {password.length > 0 && (
                  <div className="mt-4">
                    <div className="flex gap-1.5" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                            i < strength.score ? COLOR_BARRA[strength.score] : "bg-white/10"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-bold" role="status">
                      {strength.label}
                    </p>
                    {strength.hint && <p className="mt-1 text-xs leading-relaxed text-muted">{strength.hint}</p>}
                  </div>
                )}

                <ul className="mt-5 flex flex-col gap-2">
                  {strength.requirements.map((req) => (
                    <li key={req.id} className="flex items-center gap-2.5 text-xs">
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          req.met ? "bg-brand text-black" : "border border-white/20 text-muted"
                        }`}
                      >
                        {req.met ? "✓" : ""}
                      </span>
                      <span className={req.met ? "text-foreground" : "text-muted"}>
                        {req.label}
                        {req.required && !req.met && <span className="ml-1.5 text-amber-400">obligatorio</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step === "name" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">¿Cómo te llamamos?</h1>
                <p className="mt-2 text-sm text-muted">
                  Es el nombre que verán otras personas en tus playlists públicas. Podés cambiarlo cuando quieras.
                </p>

                <label className="mt-7 flex flex-col gap-2 text-sm font-semibold">
                  Nombre
                  <input
                    type="text"
                    autoFocus
                    autoComplete="name"
                    maxLength={50}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Tu nombre o tu alias"
                    className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
                  />
                </label>
                <p className="mt-2 text-xs text-muted">{displayName.trim().length}/50 · mínimo 2 caracteres</p>

                {/* En móvil no existe la columna de vista previa, así que el
                    avatar se enseña aquí: es la única forma de ver el efecto
                    de lo que se está escribiendo. */}
                <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-surface p-4 lg:hidden">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full font-extrabold"
                    style={{ background: displayName.trim() ? colorDesdeNombre(displayName.trim()) : "rgba(255,255,255,0.08)" }}
                  >
                    {iniciales(displayName, email)}
                  </div>
                  <p className="min-w-0 truncate text-sm font-semibold">{displayName.trim() || "Así te vas a ver"}</p>
                </div>
              </>
            )}

            {step === "taste" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">¿Qué te gusta escuchar?</h1>
                <p className="mt-2 text-sm text-muted">
                  Elegí los que quieras para arrancar con recomendaciones. Podés saltarte este paso.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {genres.map((genero) => {
                    const activo = selected.includes(genero.label);
                    return (
                      <button
                        key={genero.id}
                        type="button"
                        onClick={() => alternarGenero(genero.label)}
                        aria-pressed={activo}
                        className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold transition-all duration-200 hover:scale-105"
                        style={
                          activo
                            ? { borderColor: genero.color, background: `${genero.color}26`, color: genero.color }
                            : { borderColor: "rgba(255,255,255,0.15)" }
                        }
                      >
                        <span className="size-2 rounded-full" style={{ background: genero.color }} aria-hidden />
                        {genero.label}
                        {/* El número de canciones sale del catálogo: deja
                            elegir con información real en vez de a ciegas. */}
                        <span className="text-[11px] font-semibold opacity-60">{genero.trackCount}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-5 text-xs text-muted">
                  {selected.length === 0
                    ? "Ninguno elegido — no pasa nada, se aprende de lo que escuches."
                    : `${selected.length} elegido${selected.length === 1 ? "" : "s"}${selected.length >= MAX_GENRES ? " (máximo)" : ""}`}
                </p>
              </>
            )}

            {step === "terms" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">Último paso</h1>
                <p className="mt-2 text-sm text-muted">Un resumen de lo que aceptás. Los textos completos están enlazados.</p>

                <div className="mt-6 flex flex-col gap-3">
                  {[TERMS, PRIVACY].map((doc) => (
                    <Link
                      key={doc.slug}
                      href={`/legal/${doc.slug}`}
                      target="_blank"
                      className="group rounded-2xl border border-white/10 bg-surface p-4 transition-colors hover:border-white/25"
                    >
                      <p className="flex items-center justify-between gap-3 text-sm font-bold">
                        {doc.title}
                        <span className="text-xs font-semibold text-muted transition-colors group-hover:text-foreground">Leer →</span>
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{doc.summary}</p>
                    </Link>
                  ))}
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-surface p-4">
                  <input
                    type="checkbox"
                    checked={aceptaTerminos}
                    onChange={(e) => setAceptaTerminos(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="text-sm leading-relaxed">
                    He leído y acepto los términos de servicio y la política de privacidad de Peyma Music.
                    <span className="mt-1 block font-mono text-[11px] text-muted">versión {TERMS_VERSION}</span>
                  </span>
                </label>

                {/* Se dice qué queda registrado. Aceptar algo sin saber que
                    queda constancia es peor experiencia, no mejor. */}
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Al crear la cuenta guardamos la fecha y la versión que aceptaste. Si cambiamos los textos te lo
                  pediremos otra vez.
                </p>
              </>
            )}

            {error && (
              <p role="alert" className="mt-6 rounded-lg bg-danger/10 px-3.5 py-3 text-sm font-semibold text-danger">
                {error}
              </p>
            )}

            <div className="mt-8 flex items-center gap-3">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={retroceder}
                  className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold transition-colors hover:border-white"
                >
                  Atrás
                </button>
              )}
              <button
                type="submit"
                disabled={!puedeAvanzar || isSubmitting}
                className="flex-1 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {step === "terms" ? (isSubmitting ? "Creando cuenta…" : "Crear mi cuenta") : "Continuar"}
              </button>
            </div>

            {step === "taste" && selected.length === MIN_GENRES && (
              <button
                type="button"
                onClick={avanzar}
                className="mt-3 w-full text-center text-sm font-semibold text-muted transition-colors hover:text-foreground"
              >
                Saltar este paso
              </button>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-muted">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="font-semibold text-foreground hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
