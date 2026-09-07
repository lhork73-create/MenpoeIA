import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Loader2, Type, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';
import { unlockAudio } from '../hooks/useVoicePipeline';

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

export function VoiceControl({
  status,
  isRecording,
  isProcessing,
  startRecording,
  stopRecording,
  analyser,
  lastTranscript,
  onTextSubmit,
}: VoiceControlProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  const [recSecs, setRecSecs]     = useState(0);
  const [showText, setShowText]   = useState(false);
  const [textInput, setTextInput] = useState('');

  const lastClickTimeRef = useRef(0);
  const isRecordingRef   = useRef(isRecording);
  const isProcessingRef  = useRef(isProcessing);
  const startRecRef      = useRef(startRecording);
  const stopRecRef       = useRef(stopRecording);

  isRecordingRef.current  = isRecording;
  isProcessingRef.current = isProcessing;
  startRecRef.current     = startRecording;
  stopRecRef.current      = stopRecording;

  // ── Visualizador de onda de audio en vivo ─────────────────────────────────
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
          ctx.fillStyle = `rgba(239, 68, 68, ${0.35 + v * 0.65})`;
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

  // ── Contador de segundos de grabación ─────────────────────────────────────
  useEffect(() => {
    if (!isRecording) {
      setRecSecs(0);
      return;
    }
    const id = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Teclado (Espacio = Hablar/Enviar, T = Escribir) ────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (isProcessingRef.current) return;
        if (isRecordingRef.current) {
          stopRecRef.current();
        } else {
          startRecRef.current();
        }
      }

      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowText((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Acción del botón de micrófono (Toggle fiable y sin falsos cortes) ──────
  const handleMicClick = () => {
    if (isProcessingRef.current) return;
    unlockAudio();

    // Debounce de 350ms para evitar dobles toques accidentales en móviles y PC
    const now = Date.now();
    if (now - lastClickTimeRef.current < 350) return;
    lastClickTimeRef.current = now;

    if (isRecordingRef.current) {
      // Terminar de hablar y enviar el audio
      stopRecRef.current();
    } else {
      // Iniciar grabación de audio
      startRecRef.current();
    }
  };

  // ── Entrada de texto manual ───────────────────────────────────────────────
  const handleTextSubmit = () => {
    const t = textInput.trim();
    if (!t || isProcessing) return;
    unlockAudio();
    onTextSubmit?.(t);
    setTextInput('');
    setShowText(false);
  };

  const isSpeaking = status === 'speaking';
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const label = isRecording
    ? `🔴 Escuchando... Di tu mensaje (se envía solo al pausar) (${fmt(recSecs)})`
    : isProcessing
    ? 'Mirror está pensando la respuesta...'
    : isSpeaking
    ? 'Mirror está hablando... (toca para pausar)'
    : 'Toca para hablar · Usa [T] para escribir';

  return (
    <div className="fixed bottom-6 sm:bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 sm:gap-2.5 z-40 w-[94%] max-w-sm sm:max-w-md select-none pointer-events-auto">

      {/* ── Input flotante de texto ── */}
      <AnimatePresence>
        {showText && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="w-full flex gap-2"
          >
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setShowText(false);
              }}
              placeholder="Escribe tu mensaje a Mirror..."
              className="flex-1 bg-black/70 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 text-xs sm:text-sm text-white
                         placeholder:text-white/40 outline-none focus:border-primary/60 transition-colors shadow-lg"
            />
            <Button
              size="icon"
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || isProcessing}
              className="rounded-full w-10 h-10 sm:w-11 sm:h-11 bg-primary text-black hover:bg-primary/90 flex-shrink-0 disabled:opacity-40 shadow-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Barra de visualización / Estado ── */}
      <div className="w-full h-11 sm:h-12 glass-panel rounded-full overflow-hidden flex items-center justify-center relative shadow-xl border border-white/10 bg-black/40 backdrop-blur-md">
        <canvas ref={canvasRef} width={500} height={48} className="absolute inset-0 w-full h-full" />
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div
              key="rec"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 flex items-center gap-2 text-red-400 text-xs sm:text-sm font-mono font-semibold"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
              ESCUDANDO · {fmt(recSecs)}
            </motion.div>
          ) : isProcessing ? (
            <motion.div
              key="proc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 flex items-center gap-2 text-primary text-xs font-mono uppercase tracking-wider"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Procesando audio...
            </motion.div>
          ) : lastTranscript && status === 'idle' ? (
            <motion.div
              key="tr"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              className="relative z-10 text-white/70 text-[11px] sm:text-xs font-mono truncate px-6 max-w-full italic"
            >
              "{lastTranscript}"
            </motion.div>
          ) : (
            <motion.div
              key={status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 text-primary/70 text-[10px] sm:text-xs font-mono uppercase tracking-widest"
            >
              {isSpeaking ? '● Transmitiendo voz...' : 'Enlace de voz listo'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Botón Principal de Acción ── */}
      <div className="flex items-center gap-4 sm:gap-5">
        {/* Botón de texto alternativo */}
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowText((v) => !v)}
            title="Escribir mensaje (T)"
            className={`rounded-full w-10 h-10 sm:w-11 sm:h-11 border transition-all ${
              showText
                ? 'bg-primary/25 border-primary/60 text-primary shadow-[0_0_15px_rgba(0,210,255,0.3)]'
                : 'bg-black/40 backdrop-blur-md border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            {showText ? <X className="w-4 h-4" /> : <Type className="w-4 h-4" />}
          </Button>
        </motion.div>

        {/* Botón Central de Micrófono / Enviar */}
        <div className="relative">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isProcessing}
            aria-label={isRecording ? 'Terminar y enviar audio' : 'Comenzar a hablar'}
            style={{ touchAction: 'manipulation' }}
            className={[
              'rounded-full w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center',
              'shadow-2xl outline-none transition-all duration-200 cursor-pointer',
              'active:scale-95 disabled:cursor-wait',
              isRecording
                ? 'bg-red-500 text-white ring-4 ring-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.7)] animate-pulse'
                : isSpeaking
                ? 'bg-secondary/80 text-white ring-2 ring-secondary/40 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                : isProcessing
                ? 'bg-primary/30 text-primary/60 opacity-70'
                : 'bg-primary text-black shadow-[0_0_35px_rgba(0,210,255,0.6)] hover:shadow-[0_0_50px_rgba(0,210,255,0.85)] hover:scale-105',
            ].join(' ')}
          >
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.div
                  key="spin"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" />
                </motion.div>
              ) : isRecording ? (
                <motion.div
                  key="send"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Send className="w-7 h-7 sm:w-8 sm:h-8 translate-x-0.5" />
                </motion.div>
              ) : (
                <motion.div
                  key="mic"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          {/* Anillos pulsantes concéntricos durante la grabación */}
          <AnimatePresence>
            {isRecording && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-red-500/60 pointer-events-none"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-red-400/40 pointer-events-none"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.8, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, delay: 0.35, repeat: Infinity, ease: 'easeOut' }}
                />
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Espaciador simétrico para centrar perfectamente el botón de micrófono */}
        <div className="w-10 sm:w-11" />
      </div>

      {/* ── Subtítulo de Instrucción Inteligente ── */}
      <motion.p
        key={label}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[10px] sm:text-[11px] font-mono tracking-wider text-primary/80 text-center px-3 leading-tight"
      >
        {label}
      </motion.p>
    </div>
  );
}
