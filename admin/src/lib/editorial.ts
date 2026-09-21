import { http } from './httpClient';

export type EditorialKind = 'MANUAL' | 'NEW_RELEASES' | 'TOP_TRACKS' | 'TOP_ALBUMS' | 'TOP_ARTISTS';
export type EditorialLayout = 'CAROUSEL' | 'GRID' | 'HERO';

/** Etiquetas en español para los selectores del panel. */
export const KIND_LABELS: Record<EditorialKind, string> = {
  MANUAL: 'Elegida a mano',
  NEW_RELEASES: 'Lo nuevo (automática)',
  TOP_TRACKS: 'Más escuchadas (28 días)',
  TOP_ALBUMS: 'Mejores álbumes (28 días)',
  TOP_ARTISTS: 'Artistas del momento (28 días)',
};

export const LAYOUT_LABELS: Record<EditorialLayout, string> = {
  CAROUSEL: 'Carrusel horizontal',
  GRID: 'Cuadrícula',
  HERO: 'Banner destacado',
};

export interface EditorialSection {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  kind: EditorialKind;
  layout: EditorialLayout;
  position: number;
  isPublished: boolean;
  maxItems: number;
  _count: { items: number };
}

export interface SectionCard {
  id: string;
  title?: string;
  name?: string;
  coverUrl?: string;
  imageUrl?: string;
  artist?: { id: string; name: string; isVerified: boolean };
  isVerified?: boolean;
}

export interface ResolvedSection {
  id: string;
  title: string;
  subtitle: string | null;
  kind: EditorialKind;
  layout: EditorialLayout;
  tracks: SectionCard[];
  albums: SectionCard[];
  artists: SectionCard[];
}

export type SectionDraft = Omit<EditorialSection, 'id' | '_count'>;

export function fetchSections(): Promise<{ sections: EditorialSection[] }> {
  return http.get('/admin/editorial');
}

export function createSection(draft: Partial<SectionDraft>): Promise<{ section: EditorialSection }> {
  return http.post('/admin/editorial', draft);
}

export function updateSection(id: string, patch: Partial<SectionDraft>): Promise<{ section: EditorialSection }> {
  return http.patch(`/admin/editorial/${id}`, patch);
}

export function deleteSection(id: string): Promise<{ message: string }> {
  return http.delete(`/admin/editorial/${id}`);
}

export function previewSection(id: string): Promise<{ section: ResolvedSection }> {
  return http.get(`/admin/editorial/${id}/preview`);
}

export function setSectionItems(id: string, trackIds: string[]): Promise<{ section: ResolvedSection }> {
  return http.put(`/admin/editorial/${id}/items`, { items: trackIds.map((trackId) => ({ trackId })) });
}
