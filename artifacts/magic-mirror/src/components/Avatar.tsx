import React from 'react';
import { RealisticFaceAvatar } from './RealisticFaceAvatar';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';

export interface AvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
  theme?: ThemeColors;
}

export function Avatar({ status, mouthOpenAmount, micLevel = 0, theme }: AvatarProps) {
  return (
    <div className="relative w-full h-full">
      <RealisticFaceAvatar
        status={status}
        mouthOpenAmount={mouthOpenAmount}
        micLevel={micLevel}
        theme={theme}
      />
    </div>
  );
}
