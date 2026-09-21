"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../lib/AuthProvider";
import { http } from "../../../lib/httpClient";
import { CoverImage } from "../../../components/CoverImage";

/**
 * Convertirse en artista desde la web.
 *
 * La app ya lo tenía y la web no, así que sólo se podía publicar música
 * desde el teléfono.
 *
 * Crea el perfil en el SERVIDOR, que además asigna la titularidad: sin
 * ella, el pipeline de subida rechaza las canciones porque no reconoce al
 * dueño del perfil.
 */

const GENRES = ["Electrónica", "Indie Pop", "Rock Alternativo", "Hip Hop", "Jazz", "Ambient", "Lo-Fi", "Clásica"];

/** Imagen de respaldo si el usuario no tiene avatar ni pone una URL. */
const FALLBACK_IMAGE = "https://archive.org/services/img/badpanda006";

interface ArtistProfile {
  id: string;
  name: string;
  imageUrl: string;
  bio: string | null;
  genres: string[];
  _count: { tracks: number; albums: number; followers: number };
}

export default function BecomeArtistPage() {
  const router = useRouter();
  const { user, isLoading, refresh } = useAuth();

  // `undefined` = todavía no se consultó; `null` = consultado y no tiene.
  const [profile, setProfile] = useState<ArtistProfile | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    let cancelled = false;
    http
      .get<{ artist: ArtistProfile | null }>("/artists/me/profile")
      .then((res) => {
        if (!cancelled) setProfile(res.artist);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleGenre = (genre: string) =>
    setGenres((current) => (current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { artist } = await http.post<{ artist: ArtistProfile }>("/artists", {
        name: name.trim(),
        // El backend exige una imagen. Se usa el avatar si no se pone otra,
        // en vez de rechazar el formulario por un campo que casi nadie
        // tiene a mano al empezar.
        imageUrl: imageUrl.trim() || user?.avatarUrl || FALLBACK_IMAGE,
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        genres,
      });
      setProfile(artist);
      // El rol pasó a ARTIST en el servidor: hay que releer al usuario para
      // que la cabecera y los permisos lo reflejen.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear tu perfil de artista.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user || profile === undefined) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  // Ya es artista: se le muestra su perfil y los accesos que le sirven.
  if (profile) {
    return (
      <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
        <header className="flex flex-wrap items-center gap-5">
          <CoverImage src={profile.imageUrl} alt={profile.name} size={112} rounded="rounded-full" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tu perfil de artista</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{profile.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {profile._count.tracks} canción{profile._count.tracks === 1 ? "" : "es"} ·{" "}
              {profile._count.followers} seguidor{profile._count.followers === 1 ? "" : "es"}
            </p>
          </div>
        </header>

        {profile.bio && <p className="mt-6 max-w-2xl text-sm text-muted">{profile.bio}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/subir"
            className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
          >
            Subir una canción
          </Link>
          <Link
            href={`/artists/${profile.id}`}
            className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition-colors hover:border-white"
          >
            Ver mi perfil público
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Convertite en artista</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Creá tu perfil para publicar canciones. Cada una pasa por revisión antes de ser pública. Vas a poder ver tus
        oyentes, seguidores y desde dónde te escuchan.
      </p>

      <form onSubmit={submit} className="mt-8 flex max-w-xl flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Nombre artístico
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Cómo querés que te conozcan"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Foto (URL)
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
          <span className="text-xs font-normal text-muted">Si lo dejás vacío usamos tu foto de perfil.</span>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Biografía
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Contá quién sos en unas líneas"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Tus géneros</legend>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
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

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="mt-2 self-start rounded-full bg-brand px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {submitting ? "Creando…" : "Crear mi perfil de artista"}
        </button>
      </form>
    </main>
  );
}
