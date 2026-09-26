import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { fetchVerificationCandidates, setArtistVerified, type VerificationCandidate } from '../lib/artists';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es').format(value);
}

/**
 * Candidatos a verificación.
 *
 * NO es una cola de solicitudes que el artista llena — es "a quién le
 * tocaría el check si alguien se pusiera a revisar ahora", ordenado por el
 * mismo ranking compuesto (oyentes + reproducciones + seguidores) que
 * decide quién va en primera fila en el resto de la plataforma.
 */
export function VerificationPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<VerificationCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchVerificationCandidates()
      .then((res) => {
        setCandidates(res.candidates);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los candidatos.'));
  }, []);

  useEffect(load, [load]);

  const verify = async (artist: VerificationCandidate) => {
    setBusyId(artist.id);
    try {
      await setArtistVerified(artist.id, true);
      setCandidates((current) => current?.filter((c) => c.id !== artist.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell
      title="Candidatos a verificación"
      subtitle="Artistas sin check azul, ordenados por actividad real — oyentes, reproducciones y seguidores"
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!candidates ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          No hay artistas sin verificar con actividad suficiente todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((artist, index) => (
            <li
              key={artist.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
            >
              <span className="w-6 shrink-0 text-right text-xs font-bold text-muted">{index + 1}</span>
              <button
                type="button"
                onClick={() => navigate(`/artists/${artist.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <CoverImage src={artist.imageUrl} alt={artist.name} size={40} rounded="rounded-full" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold hover:underline">{artist.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatNumber(artist._count.tracks)} canción(es) · {formatNumber(artist._count.followers)} seguidores
                  </span>
                </span>
              </button>

              <div className="hidden shrink-0 gap-4 font-mono text-[11px] text-muted sm:flex">
                <span className="w-24 text-right">{formatNumber(artist.listeners)} oyentes</span>
                <span className="w-24 text-right">{formatNumber(artist.streams)} repr.</span>
              </div>

              <button
                type="button"
                onClick={() => verify(artist)}
                disabled={busyId === artist.id}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/25 disabled:opacity-50"
              >
                <BadgeCheck size={13} aria-hidden />
                Verificar
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
