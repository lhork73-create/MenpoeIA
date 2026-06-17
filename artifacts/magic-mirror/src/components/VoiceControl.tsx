import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Loader2, Radio, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';
import { beepStart, beepStop } from '@/lib/sounds';
import { vibrateStart, vibrateStop } from '@/lib/haptic';

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

const HOLD_THRESHOLD_MS = 350;

export function VoiceControl({
  status, isRecording, isProcessing,
  startRecording, stopRecording,
  analyser, lastTranscript,
  handsFree = false, onToggleHandsFree,
}: VoiceControlProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const animRef       = useRef<number>(0);
  const [recSecs, setRecSecs]     = useState(0);
  const [holdMode, setHoldMode]   = useState(false); // true = mantener presionado

  // Refs para hold-to-talk
  const pressTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef   = useRef(0);
  const isHoldActiveRef = useRef(false); // se está en modo hold

  // ── Visualizador de onda ──────────────────────────────────────────────────
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

  // ── Timer de grabación ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setRecSecs(0); return; }
    const id = setInterval(() => setRecSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Atajo teclado: Barra espaciadora ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (isProcessing) return;
      if (isRecording) { beepStop(); vibrateStop(); stopRecording(); }
      else { beepStart(); vibrateStart(); startRecording(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRecording, isProcessing, startRecording, stopRecording]);

  // ── Hold-to-talk: pointerdown/up ──────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isProcessing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressStartRef.current   = Date.now();
    isHoldActiveRef.current = false;

    if (holdMode) {
      // Hold mode: start recording immediately on press
      if (!isRecording) {
        beepStart();
        vibrateStart();
        startRecording();
        isHoldActiveRef.current = true;
      }
    } else {
      // Auto-detect: wait HOLD_THRESHOLD_MS before switching to hold mode
      pressTimerRef.current = setTimeout(() => {
        if (!isRecording) {
          beepStart();
          vibrateStart();
          startRecording();
          isHoldActiveRef.current = true;
        }
      }, HOLD_THRESHOLD_MS);
    }
  }, [isProcessing, holdMode, isRecording, startRecording]);

  const handlePointerUp = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    const duration = Date.now() - pressStartRef.current;

    if (isHoldActiveRef.current) {
      // Was hold → release sends
      if (isRecording) { beepStop(); vibrateStop(); stopRecording(); }
      isHoldActiveRef.current = false;
    } else if (duration < HOLD_THRESHOLD_MS) {
      // Short tap → toggle
      if (isRecording) { beepStop(); vibrateStop(); stopRecording(); }
      else if (!isProcessing) { beepStart(); vibrateStart(); startRecording(); }
    }
  }, [isRecording, isProcessing, startRecording, stopRecording]);

  const isSpeaking = status === 'speaking';
  const canRecord  = !isProcessing && status !== 'thinking';

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const statusLabel = isRecording
    ? `Toca para enviar · ${formatTime(recSecs)}`
    : isProcessing ? 'Procesando...'
    : isSpeaking   ? 'Hablando... (toca para interrumpir)'
    : holdMode     ? 'Mantén pulsado para hablar'
    : 'Toca · Mantén · o Espacio';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 w-[92%] max-w-lg">

      {/* Barra de onda / estado */}
      <div className="w-full h-14 glass-panel rounded-full overflow-hidden flex items-center justify-center relative">
        <canvas ref={canvasRef} width={600} height={56} className="absolute inset-0 w-full h-full" />
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative text-red-400 text-sm font-mono tracking-widest font-semibold select-none">
              ● REC {formatTime(recSecs)}
            </motion.div>
          ) : isProcessing ? (
            <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative text-secondary/80 text-xs font-mono uppercase tracking-widest">
              Analizando señal neural...
            </motion.div>
          ) : lastTranscript && status === 'idle' ? (
            <motion.div key="transcript" initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
              className="relative text-primary/60 text-xs font-mono truncate px-8 max-w-full">
              "{lastTranscript}"
            </motion.div>
          ) : (
            <motion.div key={status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative text-primary/60 text-xs font-mono uppercase tracking-widest">
              {isSpeaking ? 'Transmitiendo respuesta...' : 'Enlace neural listo'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Botones */}
      <div className="flex items-center gap-5">

        {/* Modo manos libres */}
        {onToggleHandsFree && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>
            <Button size="icon" variant="ghost" onClick={onToggleHandsFree}
              title={handsFree ? 'Desactivar manos libres (M)' : 'Activar manos libres (M)'}
              className={`rounded-full w-12 h-12 border transition-all duration-300 ${
                handsFree
                  ? 'bg-green-500/20 border-green-500/60 text-green-400 shadow-[0_0_15px_rgba(0,200,100,0.3)]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
              }`}>
              <Radio className="w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {/* Botón principal — touch amigable */}
        <motion.div whileTap={{ scale: 0.9 }}>
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            disabled={isProcessing}
            aria-label={isRecording ? 'Detener y enviar' : 'Comenzar a hablar'}
            style={{ touchAction: 'manipulation', userSelect: 'none' }}
            className={`
              rounded-full w-24 h-24 flex items-center justify-center
              shadow-2xl transition-all duration-300 outline-none select-none
              active:scale-90
              ${isRecording
                ? 'bg-red-500 text-white ring-4 ring-red-500/40 ring-offset-2 ring-offset-background shadow-[0_0_30px_rgba(255,60,60,0.5)]'
                : isSpeaking
                ? 'bg-secondary/80 text-white ring-2 ring-secondary/40'
                : isProcessing
                ? 'bg-primary/30 text-primary cursor-wait opacity-70'
                : 'bg-primary text-black shadow-[0_0_35px_rgba(0,210,255,0.5)] hover:bg-primary/90'
              }
            `}
          >
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Loader2 className="w-9 h-9 animate-spin" />
                </motion.div>
              ) : isRecording ? (
                <motion.div key="send" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Send className="w-9 h-9" />
                </motion.div>
              ) : (
                <motion.div key="mic" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Mic className="w-9 h-9" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </motion.div>

        {/* Toggle hold-to-talk */}
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>
          <Button size="icon" variant="ghost"
            onClick={() => setHoldMode(v => !v)}
            title={holdMode ? 'Modo: mantener pulsado (activo)' : 'Modo: toca para grabar (activo)'}
            className={`rounded-full w-12 h-12 border transition-all duration-300 ${
              holdMode
                ? 'bg-primary/20 border-primary/60 text-primary shadow-[0_0_15px_rgba(0,210,255,0.3)]'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
            }`}>
            <Hand className="w-5 h-5" />
          </Button>
        </motion.div>
      </div>

      {/* Etiqueta */}
      <motion.div key={statusLabel} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className="px-4 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md
                   text-xs font-mono uppercase tracking-widest text-primary/80 text-center">
        {statusLabel}
      </motion.div>

      {/* Indicador manos libres */}
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
            className="absolute bottom-[56px] left-1/2 -translate-x-1/2 w-24 h-24 rounded-full border-2 border-red-400/60 pointer-events-none"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
