import { http } from './httpClient';
import type { ModerationTrack } from './moderation';

export interface PendingRelease {
  album: {
    id: string;
    title: string;
    coverUrl: string;
    type: 'EP' | 'ALBUM';
    releaseYear: number;
    artist: { id: string; name: string; imageUrl: string; isVerified: boolean };
  };
  tracks: ModerationTrack[];
}

interface PendingReleasesResponse {
  releases: PendingRelease[];
}

/** EP/álbumes con al menos una pista pendiente — ver GET /admin/releases/pending. */
export function fetchPendingReleases(): Promise<PendingReleasesResponse> {
  return http.get<PendingReleasesResponse>('/admin/releases/pending');
}
