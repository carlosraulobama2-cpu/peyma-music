"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../lib/AuthProvider";
import { http } from "../../../lib/httpClient";
import { CoverImage } from "../../../components/CoverImage";
import { uploadAvatar } from "../../../lib/avatarUpload";
import { IMAGE_ACCEPT } from "../../../lib/fileTypes";
import { TERMS, PRIVACY, TERMS_UPDATED_LABEL } from "../../../lib/legal";

/**
 * Perfil y ajustes del usuario.
 *
 * Una sola pantalla y no dos: los "ajustes" de esta plataforma son cuatro
 * cosas (nombre, avatar, géneros favoritos, ubicación) y repartirlos en
 * dos páginas obligaría a adivinar en cuál está cada uno.
 *
 * Los ajustes de PLATAFORMA (mantenimiento, sonoridad, moderación) viven
 * en el panel de control y no aquí: son decisiones de quien opera Peyma,
 * no del oyente.
 */

const AVAILABLE_GENRES = [
  "Electrónica",
  "Indie Pop",
  "Rock Alternativo",
  "Hip Hop",
  "Jazz",
  "Ambient",
  "Lo-Fi",
  "Clásica",
  "Reguetón",
  "Trap",
];

type ConsentValue = "NOT_ASKED" | "GRANTED" | "DENIED";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, refresh } = useAuth();

  /**
   * Sólo se guarda en estado lo que el usuario ESCRIBE; mientras no toque
   * un campo, su valor se deriva del usuario en cada render.
   *
   * La alternativa —rellenar el formulario desde un efecto— es un
   * `setState` dentro de `useEffect` que arranca un render en cascada, y
   * además pisaría lo que la persona estuviera escribiendo si el usuario
   * se recargara por detrás.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [genresDraft, setGenresDraft] = useState<string[] | null>(null);
  const [consentDraft, setConsentDraft] = useState<ConsentValue | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = nameDraft ?? user?.displayName ?? "";
  const avatarUrl = avatarDraft ?? user?.avatarUrl ?? "";
  const genres = genresDraft ?? user?.favoriteGenres ?? [];
  const consent =
    consentDraft ?? ((user as { locationConsent?: ConsentValue } | null)?.locationConsent ?? "NOT_ASKED");

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const toggleGenre = (genre: string) => {
    setGenresDraft(genres.includes(genre) ? genres.filter((g) => g !== genre) : [...genres, genre]);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * Sube la foto en cuanto se elige, sin esperar a "Guardar".
   *
   * Es lo que la gente espera de una foto de perfil, y además el guardado
   * general manda `displayName` y géneros: mezclar ahí una subida de
   * archivo obligaría a mantener el archivo en memoria hasta que pulsaran
   * el botón, y a deshacerla si el resto del formulario fallara.
   */
  const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // El valor se limpia siempre: si no, elegir el MISMO archivo otra vez
    // no dispara `change` y parecería que la app se quedó colgada.
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const url = await uploadAvatar(file);
      setAvatarDraft(url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la foto.");
    } finally {
      setUploading(false);
    }
  };


  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await http.patch("/auth/me", {
        displayName: displayName.trim(),
        // Cadena vacía no es una URL válida y el backend la rechazaría:
        // se omite el campo en vez de mandar algo inválido.
        ...(avatarUrl.trim() ? { avatarUrl: avatarUrl.trim() } : {}),
        favoriteGenres: genres,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const changeConsent = async (value: "GRANTED" | "DENIED") => {
    try {
      await http.patch("/users/me/location-consent", { consent: value });
      setConsentDraft(value);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el permiso.");
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <header className="flex flex-wrap items-center gap-5">
        {/*
          La foto ES el botón. Un botón "Cambiar foto" aparte ocuparía sitio
          para decir lo que la propia imagen ya sugiere al pasar por encima.
          `capture` hace que en el móvil el navegador ofrezca la cámara
          además de la galería, que es el equivalente al pliego nativo de la app.
        */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Cambiar foto de perfil"
          className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait"
        >
          <CoverImage src={avatarUrl || null} alt={user.displayName} size={96} rounded="rounded-full" />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {uploading ? "Subiendo…" : "Cambiar"}
          </span>
          {uploading && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/70 text-xs font-semibold">
              Subiendo…
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          capture="user"
          onChange={onPickFile}
          className="hidden"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Perfil</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{user.displayName}</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
      </header>

      <form onSubmit={save} className="mt-10 flex max-w-xl flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Nombre
          <input
            type="text"
            value={displayName}
            onChange={(e) => setNameDraft(e.target.value)}
            minLength={2}
            maxLength={50}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>


        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Géneros favoritos</legend>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_GENRES.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  genres.includes(genre) ? "bg-brand text-black" : "bg-white/10 text-muted hover:text-foreground"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {saved && <p className="text-sm font-semibold text-brand">Guardado.</p>}

        <button
          type="submit"
          disabled={saving || displayName.trim().length < 2}
          className="mt-2 self-start rounded-full bg-brand px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <section className="mt-12 max-w-xl border-t border-white/10 pt-8">
        <h2 className="text-lg font-bold">Privacidad</h2>

        <div className="mt-4 rounded-xl border border-white/10 bg-surface p-4">
          <p className="text-sm font-semibold">Compartir mi zona aproximada</p>
          <p className="mt-1 text-sm text-muted">
            Guardamos sólo una zona de unos 11 km, nunca tu dirección ni tu recorrido. Alimenta el mapa de oyentes que
            ven los artistas. Si lo desactivás, borramos lo que hubiéramos guardado.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => changeConsent("GRANTED")}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                consent === "GRANTED" ? "bg-brand text-black" : "bg-white/10 text-muted hover:text-foreground"
              }`}
            >
              Activado
            </button>
            <button
              type="button"
              onClick={() => changeConsent("DENIED")}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                consent === "DENIED" ? "bg-white text-black" : "bg-white/10 text-muted hover:text-foreground"
              }`}
            >
              Desactivado
            </button>
          </div>
          {consent === "NOT_ASKED" && (
            <p className="mt-3 text-xs text-muted">Todavía no elegiste. Por defecto no compartimos nada.</p>
          )}
        </div>
      </section>

      {/*
        Los documentos legales estaban enlazados sólo desde la portada pública
        y desde el registro, así que una vez dentro de la cuenta no había
        forma de volver a leerlos. Justo al revés de lo que hace falta: se
        aceptan una vez, pero se consultan después — cuando surge la duda de
        qué se aceptó. La app móvil ya los tenía en su pantalla de perfil.
      */}
      <section className="mt-10 max-w-2xl">
        <h2 className="text-lg font-bold">Legal</h2>
        <p className="mt-1 text-sm text-muted">
          Aceptaste estos documentos al crear tu cuenta. Aquí los tenés siempre disponibles.
        </p>

        <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
          {LEGAL_LINKS.map(({ slug, title, description }) => (
            <li key={slug}>
              <Link
                href={`/legal/${slug}`}
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block truncate text-xs text-muted">{description}</span>
                </span>
                <span aria-hidden className="shrink-0 text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted">Última actualización: {TERMS_UPDATED_LABEL}.</p>
      </section>
    </main>
  );
}

/**
 * Se listan desde los documentos reales y no a mano: así, si se añade uno
 * nuevo en `lib/legal.ts`, aparece aquí sin tener que acordarse de tocar
 * esta pantalla.
 */
const LEGAL_LINKS = [
  { slug: TERMS.slug, title: TERMS.title, description: "Qué podés hacer en Peyma Music y qué esperamos de vos." },
  { slug: PRIVACY.slug, title: PRIVACY.title, description: "Qué datos guardamos, para qué, y cómo pedir que los borremos." },
] as const;
