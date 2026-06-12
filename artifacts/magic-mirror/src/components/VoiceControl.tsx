import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';

interface VoiceControlProps {
  status: AvatarStatus;
  isRecording: boolean;
  isProcessing: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  analyser?: AnalyserNode | null;
}

export function VoiceControl({
  status,
  isRecording,
  isProcessing,
  startRecording,
  stopRecording,
  analyser,
}: VoiceControlProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Waveform for MIC input (only when recording)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    cancelAnimationFrame(animRef.current);

    if (isRecording && analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        animRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(data);
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const barW = Math.max(2, (w / data.length) * 2);
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const barH = (data[i] / 255) * h * 0.9;
          const alpha = 0.3 + (data[i] / 255) * 0.7;
          ctx.fillStyle = `rgba(0,240,255,${alpha})`;
          ctx.beginPath();
          ctx.roundRect(x, h - barH, barW - 1, barH, 2);
          ctx.fill();
          x += barW + 1;
        }
      };
      draw();
    } else {
      // Clear canvas when not recording
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => cancelAnimationFrame(animRef.current);
  }, [isRecording, analyser]);

  // Determine what the button should do and show
  const canRecord = !isProcessing && status !== 'thinking';
  const isSpeaking = status === 'speaking';

  const handleButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const statusLabel = isRecording
    ? 'Tap to send'
    : isProcessing
    ? 'Processing...'
    : isSpeaking
    ? 'Speaking... (tap to interrupt)'
    : 'Tap to speak';

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50 w-[90%] max-w-lg">

      {/* Waveform / status bar */}
      <div className="w-full h-16 glass-panel rounded-full overflow-hidden flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={64}
          className="absolute inset-0 w-full h-full"
        />
        <AnimatePresence mode="wait">
          {!isRecording && (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="relative text-primary/60 text-xs font-mono uppercase tracking-widest"
            >
              {isProcessing
                ? 'Analyzing neural signal...'
                : isSpeaking
                ? 'Transmitting response...'
                : 'Neural link ready'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main push-to-talk button */}
      <motion.div whileHover={{ scale: canRecord || isSpeaking ? 1.05 : 1 }} whileTap={{ scale: 0.92 }}>
        <Button
          size="lg"
          className={`rounded-full w-20 h-20 p-0 shadow-2xl transition-all duration-300 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-400 text-white ring-4 ring-red-500/40 ring-offset-2 ring-offset-background'
              : isSpeaking
              ? 'bg-secondary/80 hover:bg-secondary text-white ring-2 ring-secondary/40'
              : isProcessing
              ? 'bg-primary/30 text-primary cursor-wait'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(0,240,255,0.4)]'
          }`}
          onClick={handleButtonClick}
          disabled={isProcessing}
          aria-label={isRecording ? 'Stop and send' : 'Start speaking'}
        >
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="w-8 h-8 animate-spin" />
              </motion.div>
            ) : isRecording ? (
              <motion.div
                key="send"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <Send className="w-8 h-8" />
              </motion.div>
            ) : (
              <motion.div
                key="mic"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <Mic className="w-8 h-8" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>

      {/* Instruction hint */}
      <motion.div
        key={statusLabel}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md
                   text-xs font-mono uppercase tracking-widest text-primary/80"
      >
        {statusLabel}
      </motion.div>

      {/* Pulse ring when recording */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            key="pulse"
            className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-red-400/60 pointer-events-none"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
