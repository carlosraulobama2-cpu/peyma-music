import { useState } from 'react';
import { approveTrack, rejectTrack } from '../lib/moderation';
import { ApiError } from '../lib/httpClient';

export function useReviewTrack() {
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (trackId: string): Promise<boolean> => {
    setPendingTrackId(trackId);
    setError(null);
    try {
      await approveTrack(trackId);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo aprobar la pista.');
      return false;
    } finally {
      setPendingTrackId(null);
    }
  };

  const reject = async (trackId: string, reason: string): Promise<boolean> => {
    setPendingTrackId(trackId);
    setError(null);
    try {
      await rejectTrack(trackId, reason);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo rechazar la pista.');
      return false;
    } finally {
      setPendingTrackId(null);
    }
  };

  return { pendingTrackId, approve, reject, error };
}
