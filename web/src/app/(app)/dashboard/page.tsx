"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/AuthProvider";
import { usePlayerStore } from "../../../store/usePlayerStore";
import { useHomeFeed } from "../../../lib/useHomeFeed";
import type { CatalogTrack } from "../../../lib/catalog";
import { Greeting } from "../../../components/home/Greeting";
import { QuickPlayGrid, QuickPlayGridSkeleton, type QuickPlayItem } from "../../../components/home/QuickPlayGrid";
import { MediaCarousel } from "../../../components/home/MediaCarousel";
import { MediaCard, MediaCardSkeleton } from "../../../components/home/MediaCard";
import { HeroRow, HeroRowSkeleton } from "../../../components/home/HeroRow";
import { ArtistRow } from "../../../components/home/ArtistRow";
import { EditorialSections } from "../../../components/home/EditorialSections";
import { TrackContextMenu } from "../../../components/TrackContextMenu";
import { CreditsModal } from "../../../components/CreditsModal";
import { ReportTrackModal } from "../../../components/ReportTrackModal";
import { LocationConsentBanner } from "../../../components/LocationConsentBanner";

/**
 * Inicio.
 *
 * Toda la portada viene de UNA petición (`/home`) cacheada en memoria — ver
 * `useHomeFeed`. Antes eran cinco llamadas en paralelo con cinco estados de
 * carga, y la web decidía por su cuenta qué filas mostrar, lo que hacía
 * imposible que coincidiera con la app.
 *
 * Lo que queda fuera del feed agregado son las secciones del curador, que
 * ya venían resueltas en la misma respuesta, y "Todo el catálogo", que se
 * quitó: una lista infinita de todo al final de Inicio no es una sección
 * editorial, es un volcado de la base de datos.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const play = usePlayerStore((s) => s.play);
  const { data, loading, error } = useHomeFeed();

  // Menú de opciones de las tarjetas: mismo componente que usan las listas
  // de canciones, para que las acciones sean exactamente las mismas en toda
  // la app en vez de dos menús que se van separando con el tiempo.
  const [menu, setMenu] = useState<{ track: CatalogTrack; x: number; y: number } | null>(null);
  const [creditsTrack, setCreditsTrack] = useState<CatalogTrack | null>(null);
  const [reportTrack, setReportTrack] = useState<CatalogTrack | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  const quickPlayItems: QuickPlayItem[] = (data?.quickAccess ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    coverUrl: item.coverUrl ?? "",
    onPlay: () => {
      if (item.kind === "playlist") {
        router.push(`/playlists/${item.id}`);
        return;
      }
      // Es una pista del historial: se busca en las filas ya cargadas para
      // reproducirla con su contexto, en vez de pedirla otra vez.
      const all = (data?.rows ?? []).flatMap((row) => row.tracks);
      const track = all.find((candidate) => candidate.id === item.id);
      if (track) play(track as CatalogTrack, all as CatalogTrack[]);
    },
  }));

  return (
    <main className="flex-1 flex flex-col pb-32">
      <div className="flex flex-col gap-10 px-6 py-8 sm:px-10">
        <Greeting name={user.displayName} />

        <LocationConsentBanner />

        {error && !data && (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {loading && !data ? (
          <>
            <HeroRowSkeleton />
            <QuickPlayGridSkeleton />
            <MediaCarousel title="Cargando…">
              {[...Array(6)].map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))}
            </MediaCarousel>
          </>
        ) : (
          data && (
            <>
              <HeroRow items={data.hero} />

              {quickPlayItems.length > 0 && <QuickPlayGrid items={quickPlayItems} />}

              {data.rows.map((row) => (
                <MediaCarousel key={row.key} title={row.title}>
                  {row.tracks.map((track) => (
                    <MediaCard
                      key={track.id}
                      title={track.title}
                      subtitle={track.artist.name}
                      coverUrl={track.coverUrl}
                      onPlay={() => play(track as CatalogTrack, row.tracks as CatalogTrack[])}
                      artistId={track.artist.id}
                      onOpenMenu={(position) => setMenu({ track: track as CatalogTrack, ...position })}
                    />
                  ))}
                </MediaCarousel>
              ))}

              {/* Artistas populares, en avatar redondo y con desplazamiento
                  horizontal. Va antes de las secciones del curador porque
                  "quién" suele importar más que "qué" al abrir la app. */}
              <ArtistRow
                title="Artistas populares"
                artists={data.artists.map((artist) => ({
                  ...artist,
                  subtitle:
                    artist.listeners > 0
                      ? `${artist.listeners} oyente${artist.listeners === 1 ? "" : "s"}`
                      : "Artista",
                }))}
              />

              <EditorialSections sections={data.sections} loading={false} onPlay={play} />
            </>
          )
        )}
      </div>

      {menu && (
        <TrackContextMenu
          track={menu.track}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onShowCredits={setCreditsTrack}
          onReport={setReportTrack}
        />
      )}
      {creditsTrack && <CreditsModal track={creditsTrack} onClose={() => setCreditsTrack(null)} />}
      {reportTrack && <ReportTrackModal track={reportTrack} onClose={() => setReportTrack(null)} />}
    </main>
  );
}
