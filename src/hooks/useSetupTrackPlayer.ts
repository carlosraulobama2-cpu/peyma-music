import { useEffect, useState } from 'react';
import { setupTrackPlayer } from '../services/trackPlayerService';

export function useSetupTrackPlayer() {
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function setup() {
      const isSetup = await setupTrackPlayer();
      if (isMounted) {
        setIsPlayerReady(isSetup);
      }
    }

    setup();

    return () => {
      isMounted = false;
    };
  }, []);

  return isPlayerReady;
}
