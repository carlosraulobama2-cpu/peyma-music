import type { Track } from './index';

export interface TrendingTrack extends Track {
  rank: number;
  previousRank: number;
  streams: number;
}

export interface TrendingChart {
  locationLabel: string;
  topTracks: TrendingTrack[];
}
