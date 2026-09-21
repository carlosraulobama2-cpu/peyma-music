"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/AuthProvider";
import { getAuthToken } from "../../../lib/httpClient";
import { fetchArtists, type ArtistSummary } from "../../../lib/artists";
import { uploadTrack, UPLOAD_STEPS, type UploadStep } from "../../../lib/uploadPipeline";

/**
 * Subir una canción desde la web.
 *
 * Mismo flujo que la app y el panel: crear borrador, audio, portada,
 * análisis y envío a revisión. Termina en PENDING_REVIEW — nunca se
 * publica sola — y aparece en el panel para que un administrador la
 * apruebe.
 */
export default function UploadPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [artistId, setArtistId] = useState("");
  const [title, setTitle] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    fetchArtists()
      .then(setArtists)
      .catch(() => setError("No se pudieron cargar los artistas."));
  }, []);

  const busy = step !== null;
  const canSubmit = Boolean(artistId && title.trim() && audio && cover) && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !audio || !cover) return;

    setError(null);
    setDone(null);
    try {
      const track = await uploadTrack({
        artistId,
        title: title.trim(),
        audio,
        cover,
        token: getAuthToken(),
        onStep: setStep,
      });
      setDone(track.title);
      setTitle("");
      setAudio(null);
      setCover(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la canción.");
    } finally {
      setStep(null);
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
      <h1 className="text-3xl font-extrabold tracking-tight">Subir una canción</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Tu canción pasa por el análisis de audio y queda esperando la aprobación de un moderador. No se publica sola.
      </p>

      <form onSubmit={submit} className="mt-8 flex max-w-xl flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Artista
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          >
            <option value="">Elegí un artista…</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Título
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Nombre de la canción"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Audio (.mp3, .wav, .m4a, .ogg, .flac)
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/flac"
            onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Portada (.jpg, .png, .webp)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {busy && (
          <ol className="flex flex-col gap-1.5 rounded-lg bg-surface p-4 text-sm">
            {UPLOAD_STEPS.map((label, index) => (
              <li
                key={label}
                className={index < step! ? "text-brand" : index === step ? "font-semibold" : "text-muted"}
              >
                {index < step! ? "✓" : index === step ? "→" : "·"} {label}
              </li>
            ))}
          </ol>
        )}

        {done && (
          <div className="rounded-lg bg-brand/10 px-4 py-3 text-sm ring-1 ring-inset ring-brand/30">
            <p className="font-semibold text-brand">&ldquo;{done}&rdquo; se envió a revisión</p>
            <p className="mt-1 text-muted">
              Un moderador la va a escuchar y aprobar. Te avisamos cuando esté publicada.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy ? "Subiendo…" : "Enviar a revisión"}
        </button>
      </form>
    </main>
  );
}
