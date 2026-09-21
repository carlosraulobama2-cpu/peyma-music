"use client";

import { createContext, useContext } from "react";
import type { CatalogPlaylist } from "./catalog";
import type { FollowedArtist } from "./library";

export interface LibraryData {
  playlists: CatalogPlaylist[];
  artists: FollowedArtist[];
  loading: boolean;
  /** Para que una página pueda añadir una playlist recién creada sin recargar todo. */
  addPlaylist: (playlist: CatalogPlaylist) => void;
}

export const LibraryContext = createContext<LibraryData | null>(null);

/**
 * La biblioteca se carga una sola vez en `AppShell` y la comparten el
 * sidebar y la página `/library` — antes cada uno pedía lo mismo por
 * separado, duplicando dos peticiones en cada navegación.
 */
export function useLibrary(): LibraryData {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary() debe usarse dentro de <AppShell>");
  return ctx;
}
