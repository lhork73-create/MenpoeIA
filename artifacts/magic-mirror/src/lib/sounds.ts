// Feedback de audio usando Web Audio API (sin archivos externos)
export function playBeep(freq: number, durationSec: number, vol = 0.25) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSec);
    osc.onended = () => ctx.close();
  } catch {
    // Entorno sin Web Audio, ignorar
  }
}

// Beep de inicio de grabación — tono alto, corto
export const beepStart = () => playBeep(880, 0.08, 0.2);

// Beep de fin de grabación — tono más bajo, ligeramente más largo
export const beepStop = () => playBeep(520, 0.12, 0.18);
