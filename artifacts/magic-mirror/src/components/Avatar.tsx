import React from 'react';
import { RealisticFaceAvatar, AvatarGender, RealisticFaceAvatarProps } from './RealisticFaceAvatar';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';

export type { AvatarGender };

export interface AvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
  theme?: ThemeColors;
  gender?: AvatarGender;
}

export function Avatar({ status, mouthOpenAmount, micLevel = 0, theme, gender = 'female' }: AvatarProps) {
  return (
    <div className="relative w-full h-full">
      <RealisticFaceAvatar
        status={status}
        mouthOpenAmount={mouthOpenAmount}
        micLevel={micLevel}
        gender={gender}
        theme={theme}
      />
    </div>
  );
}
