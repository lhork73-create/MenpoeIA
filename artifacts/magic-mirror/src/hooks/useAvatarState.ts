import { useState, useCallback } from 'react';

export type AvatarStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export function useAvatarState() {
  const [status, setStatus] = useState<AvatarStatus>('idle');
  const [mouthOpenAmount, setMouthOpenAmount] = useState(0);

  const setSpeakingVolume = useCallback((volume: number) => {
    // Volume usually comes in 0-255 or 0-1 range. Assume normalized 0-1 for mouth
    const smoothVolume = Math.min(Math.max(volume, 0), 1);
    setMouthOpenAmount(smoothVolume);
  }, []);

  return {
    status,
    setStatus,
    mouthOpenAmount,
    setSpeakingVolume,
  };
}
