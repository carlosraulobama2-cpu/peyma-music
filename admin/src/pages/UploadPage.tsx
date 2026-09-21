import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { fetchArtists, type AdminArtist } from '../lib/artists';
import { createUpload, uploadAudio, uploadCover, analyzeUpload, publishUpload, readAudioDuration } from '../lib/uploads';

/** Los pasos que realmente ejecuta el pipeline del backend, en orden. */
const STEPS = ['Creando borrador', 'Subiendo audio', 'Subiendo portada', 'Analizando ritmo', 'Publicando'] as const;

export function UploadPage() {
  const navigate = useNavigate();

  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [artistId, setArtistId] = useState('');
  const [title, setTitle] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);

  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; status: string } | null>(null);

  useEffect(() => {
    fetchArtists()
      .then((res) => setArtists(res.artists))
      .catch(() => setError('No se pudieron cargar los artistas.'));
  }, []);

  const isSubmitting = stepIndex >= 0;
  const canSubmit = artistId && title.trim() && audio && cover && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !audio || !cover) return;

    setError(null);
    setDone(null);
    try {
      setStepIndex(0);
      const { upload } = await createUpload(artistId, title.trim());

      setStepIndex(1);
      const duration = await readAudioDuration(audio);
      await uploadAudio(upload.id, audio, duration);

      setStepIndex(2);
      await uploadCover(upload.id, cover);

      setStepIndex(3);
      await analyzeUpload(upload.id);

      setStepIndex(4);
      const { track } = await publishUpload(upload.id);

      setDone({ title: track.title, status: track.status });
      setTitle('');
      setAudio(null);
      setCover(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la subida.');
    } finally {
      setStepIndex(-1);
    }
  };

  return (
    // El título y el subtítulo los pone AdminShell; repetirlos aquí los
    // mostraba dos veces seguidos. El formulario va con ancho de lectura: un
    // campo de texto de 1200 px de ancho no se lee, se recorre.
    <AdminShell
      title="Subir canción"
      subtitle="Pasa por el mismo pipeline que una subida de artista: se analiza el ritmo y queda en la cola de moderación, no se publica sola."
    >
        <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Artista
            <select
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
              required
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
            >
              <option value="">Elegí un artista…</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.isBlocked ? ' (bloqueado)' : ''}
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
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Audio (.mp3, .wav, .m4a, .ogg, .flac)
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/flac"
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              required
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Portada (.jpg, .png, .webp)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              required
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </p>
          )}

          {isSubmitting && (
            <ol className="flex flex-col gap-1.5 rounded-lg bg-surface p-4 text-sm">
              {STEPS.map((step, i) => (
                <li key={step} className={i < stepIndex ? 'text-brand' : i === stepIndex ? 'font-semibold' : 'text-muted'}>
                  {i < stepIndex ? '✓' : i === stepIndex ? '→' : '·'} {step}
                </li>
              ))}
            </ol>
          )}

          {done && (
            <div className="rounded-lg bg-brand/10 px-4 py-3 text-sm ring-1 ring-inset ring-brand/30">
              <p className="font-semibold text-brand">Se subió &ldquo;{done.title}&rdquo;</p>
              <p className="mt-1 text-muted">
                Quedó en estado <span className="font-mono">{done.status}</span>. Aprobala desde{' '}
                <button type="button" onClick={() => navigate('/moderation')} className="font-semibold text-foreground underline">
                  Moderación
                </button>{' '}
                para que sea pública.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? 'Subiendo…' : 'Subir y analizar'}
          </button>
        </form>
    </AdminShell>
  );
}
