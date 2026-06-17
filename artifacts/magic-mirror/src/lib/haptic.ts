// Vibración háptica para dispositivos móviles
export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

export const vibrateStart = () => vibrate(40);
export const vibrateStop  = () => vibrate([25, 15, 25]);
export const vibrateError = () => vibrate([60, 20, 60, 20, 60]);
