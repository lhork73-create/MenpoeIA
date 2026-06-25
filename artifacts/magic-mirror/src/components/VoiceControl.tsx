import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Loader2, Radio, Hand, Type, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';

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
  onTextSubmit?: (text: string) => void;
}

const HOLD_MS = 400; // ms para detectar hold-to-talk

export function VoiceControl({
  status, isRecording, isProcessing,
  startRecording, stopRecording,
  analyser, lastTranscript,
  handsFree = false, onToggleHandsFree,
  onTextSubmit,
}: VoiceControlProps) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const animRef         = useRef<number>(0);
  const [recSecs, setRecSecs]     = useState(0);
  const [showText, setShowText]   = useState(false);
  const [textInput, setTextInput] = useState('');

  // Refs para hold-to-talk — evitan closures obsoletos
  const pressTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef     = useRef(0);
  const holdActiveRef     = useRef(false);   // ¿Se activó hold-to-talk en este press?
  const holdModeRef       = useRef(false);   // ¿Modo hold-to-talk activado por el usuario?
  const [holdMode, setHoldModeState] = useState(false);

  const isRecordingRef   = useRef(isRecording);
  const isProcessingRef  = useRef(isProcessing);
  const startRecRef      = useRef(startRecording);
  const stopRecRef       = useRef(stopRecording);
  isRecordingRef.current  = isRecording;
  isProcessingRef.current = isProcessing;
  startRecRef.current     = startRecording;
  stopRecRef.current      = stopRecording;

  const setHoldMode = (v: boolean) => {
    holdModeRef.current = v;
    setHoldModeState(v);
  };

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
        const barW = Math.max(2, (w / data.length) * 2.2);
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 255;
          const barH = v * h * 0.88;
          ctx.fillStyle = `rgba(255,70,70,${0.25 + v * 0.75})`;
          ctx.beginPath();
          ctx.roundRect(x, h - barH, Math.max(1, barW - 1), barH, 2);
          ctx.fill();
          x += barW + 1;
          if (x > w) break;
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

  // ── Teclado: Barra espaciadora — usa REFS para evitar closures obsoletos ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (isProcessingRef.current) return;
      if (isRecordingRef.current) {
        stopRecRef.current();
      } else {
        startRecRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // sin dependencias — usa refs siempre actualizadas

  // ── Pointer Events para hold-to-talk ──────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isProcessingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressStartRef.current  = Date.now();
    holdActiveRef.current  = false;

    if (holdModeRef.current) {
      // Modo hold: graba al instante mientras se mantiene pulsado
      if (!isRecordingRef.current) {
        startRecRef.current();
        holdActiveRef.current = true;
      }
    } else {
      // Auto-detect: si mantiene > HOLD_MS, activa hold-to-talk
      pressTimerRef.current = setTimeout(() => {
        if (!isRecordingRef.current) {
          startRecRef.current();
          holdActiveRef.current = true;
        }
      }, HOLD_MS);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    const elapsed = Date.now() - pressStartRef.current;

    if (holdActiveRef.current) {
      // Se activó hold-to-talk: al soltar, para y envía
      if (isRecordingRef.current) stopRecRef.current();
      holdActiveRef.current = false;
    } else if (elapsed < HOLD_MS) {
      // Toque corto = toggle
      if (isRecordingRef.current) {
        stopRecRef.current();
      } else if (!isProcessingRef.current) {
        startRecRef.current();
      }
    }
  };

  const onPointerCancel = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    if (holdActiveRef.current && isRecordingRef.current) stopRecRef.current();
    holdActiveRef.current = false;
  };

  // ── Entrada de texto ──────────────────────────────────────────────────────
  const handleTextSubmit = () => {
    const t = textInput.trim();
    if (!t || isProcessing) return;
    onTextSubmit?.(t);
    setTextInput('');
    setShowText(false);
  };

  const isSpeaking = status === 'speaking';
  const canAct     = !isProcessing && status !== 'thinking';

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const label = isRecording
    ? `Toca para enviar · ${fmt(recSecs)}`
    : isProcessing ? 'Procesando...'
    : isSpeaking ? 'Hablando... (Esc para interrumpir)'
    : holdMode ? 'Mantén pulsado para grabar, suelta para enviar'
    : 'Toca · Mantén · Espacio · T para texto';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 w-[94%] max-w-lg select-none">

      {/* ── Entrada de texto ── */}
      <AnimatePresence>
        {showText && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="w-full flex gap-2">
            <input
              autoFocus
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setShowText(false);
              }}
              placeholder="Escribe tu mensaje..."
              className="flex-1 bg-black/60 border border-white/20 rounded-full px-5 py-3 text-sm text-white
                         placeholder:text-white/35 outline-none focus:border-primary/60 transition-colors"
            />
            <Button size="icon"
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || isProcessing}
              className="rounded-full w-12 h-12 bg-primary text-black hover:bg-primary/90 flex-shrink-0 disabled:opacity-40">
              <Send className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Barra de onda / estado ── */}
      <div className="w-full h-14 glass-panel rounded-full overflow-hidden flex items-center justify-center relative">
        <canvas ref={canvasRef} width={600} height={56} className="absolute inset-0 w-full h-full" />
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative z-10 flex items-center gap-2 text-red-400 text-sm font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              REC {fmt(recSecs)}
            </motion.div>
          ) : isProcessing ? (
            <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative z-10 text-primary/80 text-xs font-mono uppercase tracking-widest">
              Procesando señal neural...
            </motion.div>
          ) : lastTranscript && status === 'idle' ? (
            <motion.div key="tr" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              className="relative z-10 text-white/55 text-xs font-mono truncate px-8 max-w-full italic">
              "{lastTranscript}"
            </motion.div>
          ) : (
            <motion.div key={status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative z-10 text-primary/50 text-xs font-mono uppercase tracking-widest">
              {isSpeaking ? 'Transmitiendo...' : 'Enlace neural listo'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Botones ── */}
      <div className="flex items-center gap-4">

        {/* Manos libres */}
        {onToggleHandsFree && (
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}>
            <Button size="icon" variant="ghost" onClick={onToggleHandsFree}
              title={handsFree ? 'Desactivar manos libres (M)' : 'Activar manos libres (M)'}
              className={`rounded-full w-12 h-12 border transition-all ${
                handsFree
                  ? 'bg-green-500/20 border-green-400/60 text-green-400 shadow-[0_0_15px_rgba(0,200,80,0.35)]'
                  : 'bg-white/5 border-white/10 text-white/35 hover:text-white/70 hover:bg-white/10'
              }`}>
              <Radio className="w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {/* ── Botón principal de micrófono ── */}
        <div className="relative">
          <button
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerCancel}
            disabled={isProcessing}
            aria-label={isRecording ? 'Enviar audio' : 'Grabar audio'}
            style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
            className={[
              'rounded-full w-24 h-24 flex items-center justify-center',
              'shadow-2xl outline-none transition-all duration-200',
              'active:scale-90 disabled:cursor-wait',
              isRecording
                ? 'bg-red-500 text-white ring-4 ring-red-500/40 ring-offset-2 ring-offset-black shadow-[0_0_35px_rgba(255,50,50,0.6)]'
                : isSpeaking
                ? 'bg-secondary/70 text-white ring-2 ring-secondary/40'
                : isProcessing
                ? 'bg-primary/20 text-primary/50 opacity-60'
                : 'bg-primary text-black shadow-[0_0_40px_rgba(0,210,255,0.55)] hover:shadow-[0_0_55px_rgba(0,210,255,0.7)]',
            ].join(' ')}
          >
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.div key="spin" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}>
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

          {/* Anillo pulsante al grabar */}
          <AnimatePresence>
            {isRecording && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-red-400/50 pointer-events-none"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 2.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Hold-to-talk toggle */}
        <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}>
          <Button size="icon" variant="ghost"
            onClick={() => setHoldMode(!holdModeRef.current)}
            title={holdMode ? 'Modo hold-to-talk (activo) — click para desactivar' : 'Activar hold-to-talk'}
            className={`rounded-full w-12 h-12 border transition-all ${
              holdMode
                ? 'bg-primary/20 border-primary/60 text-primary shadow-[0_0_15px_rgba(0,210,255,0.3)]'
                : 'bg-white/5 border-white/10 text-white/35 hover:text-white/70 hover:bg-white/10'
            }`}>
            <Hand className="w-5 h-5" />
          </Button>
        </motion.div>

        {/* Entrada de texto */}
        <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}>
          <Button size="icon" variant="ghost"
            onClick={() => setShowText(v => !v)}
            title="Escribir en lugar de hablar (T)"
            className={`rounded-full w-12 h-12 border transition-all ${
              showText
                ? 'bg-violet-500/20 border-violet-400/60 text-violet-400'
                : 'bg-white/5 border-white/10 text-white/35 hover:text-white/70 hover:bg-white/10'
            }`}>
            {showText ? <X className="w-5 h-5" /> : <Type className="w-5 h-5" />}
          </Button>
        </motion.div>
      </div>

      {/* ── Etiqueta de estado ── */}
      <motion.p
        key={label}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[11px] font-mono uppercase tracking-widest text-primary/70 text-center px-2">
        {label}
      </motion.p>

      {/* ── Indicador manos libres ── */}
      <AnimatePresence>
        {handsFree && (
          <motion.p key="hf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[10px] font-mono uppercase tracking-widest text-green-400/70">
            ● Manos libres activo — Mirror escuchará automáticamente
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
