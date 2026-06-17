import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';
import { beepStart, beepStop } from '@/lib/sounds';

interface VoiceControlProps {
  status: AvatarStatus;
  isRecording: boolean;
  isProcessing: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  analyser?: AnalyserNode | null;
  lastTranscript?: string;
  handsFree?: boolean;
  onToggleHandsFree?: () => void;
}

export function VoiceControl({
  status,
  isRecording,
  isProcessing,
  startRecording,
  stopRecording,
  analyser,
  lastTranscript,
  handsFree = false,
  onToggleHandsFree,
}: VoiceControlProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef  = useRef<number>(0);
  const [recSecs, setRecSecs] = useState(0);

  // ── Visualizador de onda ─────────────────────────────────────────────────
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
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const barW = Math.max(2, (w / data.length) * 2);
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const barH = (data[i] / 255) * h * 0.9;
          const alpha = 0.3 + (data[i] / 255) * 0.7;
          ctx.fillStyle = `rgba(255,80,80,${alpha})`;
          ctx.beginPath();
          ctx.roundRect(x, h - barH, barW - 1, barH, 2);
          ctx.fill();
          x += barW + 1;
        }
      };
      draw();
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRecording, analyser]);

  // ── Timer de grabación ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setRecSecs(0); return; }
    const id = setInterval(() => setRecSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Atajo teclado: Barra espaciadora ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (isProcessing) return;
      if (isRecording) { beepStop(); stopRecording(); }
      else { beepStart(); startRecording(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRecording, isProcessing, startRecording, stopRecording]);

  const isSpeaking = status === 'speaking';
  const canRecord  = !isProcessing && status !== 'thinking';

  const handleClick = () => {
    if (isRecording) { beepStop(); stopRecording(); }
    else if (canRecord || isSpeaking) { beepStart(); startRecording(); }
  };

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const statusLabel = isRecording
    ? `Toca o Espacio para enviar · ${formatTime(recSecs)}`
    : isProcessing
    ? 'Procesando...'
    : isSpeaking
    ? 'Hablando... (toca para interrumpir)'
    : 'Toca o Espacio para hablar';

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50 w-[90%] max-w-lg">

      {/* Barra de onda / estado */}
      <div className="w-full h-16 glass-panel rounded-full overflow-hidden flex items-center justify-center relative">
        <canvas ref={canvasRef} width={600} height={64} className="absolute inset-0 w-full h-full" />

        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div key="rec" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="relative text-red-400 text-sm font-mono tracking-widest font-semibold select-none">
              ● REC {formatTime(recSecs)}
            </motion.div>
          ) : isProcessing ? (
            <motion.div key="proc" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="relative text-secondary/80 text-xs font-mono uppercase tracking-widest">
              Analizando señal neural...
            </motion.div>
          ) : lastTranscript && status === 'idle' ? (
            <motion.div key="transcript" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.55, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="relative text-primary/60 text-xs font-mono truncate px-8 max-w-full">
              "{lastTranscript}"
            </motion.div>
          ) : (
            <motion.div key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="relative text-primary/60 text-xs font-mono uppercase tracking-widest">
              {isSpeaking ? 'Transmitiendo respuesta...' : 'Enlace neural listo'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Botón principal + modo manos libres */}
      <div className="flex items-center gap-4">
        {/* Botón modo manos libres */}
        {onToggleHandsFree && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>
            <Button
              size="icon"
              variant="ghost"
              onClick={onToggleHandsFree}
              title={handsFree ? 'Desactivar modo manos libres' : 'Activar modo manos libres'}
              className={`rounded-full w-12 h-12 border transition-all duration-300 ${
                handsFree
                  ? 'bg-green-500/20 border-green-500/60 text-green-400 shadow-[0_0_15px_rgba(0,200,100,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
              }`}
            >
              <Radio className="w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {/* Botón push-to-talk */}
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
            onClick={handleClick}
            disabled={isProcessing}
            aria-label={isRecording ? 'Detener y enviar' : 'Comenzar a hablar'}
          >
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Loader2 className="w-8 h-8 animate-spin" />
                </motion.div>
              ) : isRecording ? (
                <motion.div key="send" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                  <Send className="w-8 h-8" />
                </motion.div>
              ) : (
                <motion.div key="mic" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                  <Mic className="w-8 h-8" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
      </div>

      {/* Etiqueta de estado */}
      <motion.div key={statusLabel} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className="px-4 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md
                   text-xs font-mono uppercase tracking-widest text-primary/80">
        {statusLabel}
      </motion.div>

      {/* Indicador modo manos libres */}
      <AnimatePresence>
        {handsFree && (
          <motion.div key="hf" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-[10px] font-mono uppercase tracking-widest text-green-400/70">
            Modo manos libres activo
          </motion.div>
        )}
      </AnimatePresence>

      {/* Anillo pulsante al grabar */}
      <AnimatePresence>
        {isRecording && (
          <motion.div key="pulse"
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
