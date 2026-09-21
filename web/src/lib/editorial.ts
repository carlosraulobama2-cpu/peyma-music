import { http } from "./httpClient";
import type { CatalogTrack, CatalogAlbum } from "./catalog";

/**
 * Secciones de la portada definidas desde el panel de control.
 *
 * Es el MISMO endpoint que consume la app móvil (`src/services/api.ts`), a
 * propósito: si cada cliente decidiera por su cuenta qué es "Lo nuevo", los
 * dos acabarían mostrando cosas distintas y el curador no tendría forma de
 * cambiarlo sin desplegar.
 */

export type EditorialLayout = "CAROUSEL" | "GRID" | "HERO";

export interface EditorialArtistCard {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  isVerified: boolean;
}

export interface EditorialSection {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  kind: string;
  layout: EditorialLayout;
  position: number;
  tracks: CatalogTrack[];
  albums: CatalogAlbum[];
  artists: EditorialArtistCard[];
}

export async function fetchEditorialSections(): Promise<EditorialSection[]> {
  const { sections } = await http.get<{ sections: EditorialSection[] }>("/editorial");
  return sections;
}

/**
 * Una sección concreta por slug — el destino de `/seccion/:slug`.
 *
 * Devuelve `null` en vez de lanzar cuando no existe: una sección
 * despublicada desde el panel es un caso normal, no un error, y la página
 * muestra un mensaje en lugar de romperse.
 */
export async function fetchEditorialSection(slug: string): Promise<EditorialSection | null> {
  try {
    const { section } = await http.get<{ section: EditorialSection }>(`/editorial/${encodeURIComponent(slug)}`);
    return section;
  } catch {
    return null;
  }
}
