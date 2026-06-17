import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ParticleBackground } from '@/components/ParticleBackground';
import { KeyboardHelp } from '@/components/KeyboardHelp';
import { SessionStats } from '@/components/SessionStats';
import { ThinkingIndicator } from '@/components/ThinkingIndicator';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { useTheme, THEMES, ThemeName } from '@/hooks/useTheme';
import { useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Link } from 'wouter';
import {
  Settings, History, RotateCcw, Save, StopCircle,
  Palette, Share2, AlignLeft, AlignCenter, AlignJustify,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { beepStart } from '@/lib/sounds';
import { vibrateStart } from '@/lib/haptic';
import { ResponseLength } from '@/hooks/useVoicePipeline';

const LENGTH_LABELS: Record<ResponseLength, { icon: React.ReactNode; label: string }> = {
  corta: { icon: <AlignLeft  className="w-3.5 h-3.5" />, label: 'Corta'  },
  media: { icon: <AlignCenter className="w-3.5 h-3.5" />, label: 'Media' },
  larga: { icon: <AlignJustify className="w-3.5 h-3.5" />, label: 'Larga' },
};
const LENGTHS: ResponseLength[] = ['corta', 'media', 'larga'];

export default function MirrorPage() {
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const {
    isRecording, isProcessing, startRecording, stopRecording,
    history, lastTranscript, lastError,
    analyser, interruptSpeech, resetConversation, saveConversation,
    tokensTotal, sessionStart,
    responseLength, setResponseLength,
  } = useVoicePipeline(setStatus, setSpeakingVolume);

  const { theme, setTheme, themes } = useTheme();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [handsFree,        setHandsFree]        = useState(false);
  const [showThemePicker,  setShowThemePicker]  = useState(false);
  const [micLevel,         setMicLevel]         = useState(0);
  const [tapCount,         setTapCount]         = useState(0); // for double-tap to interrupt

  const seenCountRef      = useRef(0);
  const prevStatusRef     = useRef(status);
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  const tapTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mic level ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!analyser || !isRecording) { setMicLevel(0); return; }
    const data = new Uint8Array(analyser.frequencyBinCount);
    let id: number;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMicLevel(avg / 255);
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [analyser, isRecording]);

  // ── Unread count ──────────────────────────────────────────────────────────
  const aiCount     = history.filter(m => m.role === 'assistant').length;
  const unreadCount = isTranscriptOpen ? 0 : Math.max(0, aiCount - seenCountRef.current);

  const handleToggleTranscript = useCallback(() => {
    if (!isTranscriptOpen) seenCountRef.current = aiCount;
    setIsTranscriptOpen(v => !v);
  }, [isTranscriptOpen, aiCount]);

  useEffect(() => {
    if (isTranscriptOpen) seenCountRef.current = aiCount;
  }, [aiCount, isTranscriptOpen]);

  // ── Hands-free ────────────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === 'speaking' && status === 'idle' && handsFree && !isRecording && !isProcessing) {
      const timer = setTimeout(() => { beepStart(); vibrateStart(); startRecordingRef.current(); }, 700);
      return () => clearTimeout(timer);
    }
  }, [status, handsFree, isRecording, isProcessing]);

  // ── Double-tap on avatar area to interrupt AI ─────────────────────────────
  const handleAvatarTap = useCallback(() => {
    if (status !== 'speaking') return;
    setTapCount(c => {
      const next = c + 1;
      if (next === 1) {
        tapTimerRef.current = setTimeout(() => setTapCount(0), 400);
      } else if (next >= 2) {
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        setTapCount(0);
        interruptSpeech();
      }
      return next;
    });
  }, [status, interruptSpeech]);

  // ── Share last AI message ─────────────────────────────────────────────────
  const shareLastMessage = useCallback(() => {
    const last = [...history].reverse().find(m => m.role === 'assistant')?.content;
    if (!last) return;
    if (navigator.share) {
      navigator.share({ title: 'Mirror AI', text: last }).catch(() => {});
    } else {
      navigator.clipboard.writeText(last).then(() => {}).catch(() => {});
    }
  }, [history]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); handleToggleTranscript(); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); resetConversation(); }
      if (e.key === 'Escape' && status === 'speaking') interruptSpeech();
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setHandsFree(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, interruptSpeech, resetConversation, handleToggleTranscript]);

  const avatarName = settings?.avatarName ?? 'Mirror';
  const lastAiMsg  = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';

  // ── Swipe gesture to open/close transcript (mobile) ──────────────────────
  const touchStartX  = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (dx > 60)  { if (!isTranscriptOpen) handleToggleTranscript(); }  // swipe left → open
    if (dx < -60) { if (isTranscriptOpen)  handleToggleTranscript(); }  // swipe right → close
  };

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Partículas de fondo */}
      <ParticleBackground primaryRgb={theme.rgb} />

      {/* Fondo degradado */}
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-1/2 bg-secondary/5 blur-[120px] rounded-full" />
      </div>

      {/* Estadísticas de sesión */}
      <div className="relative z-40">
        <SessionStats messageCount={history.length} tokensTotal={tokensTotal} sessionStart={sessionStart} />
      </div>

      {/* ── Navegación superior izquierda ── */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <Link href="/history">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 w-10 h-10"
            title="Historial (H)">
            <History className="w-4 h-4" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 w-10 h-10"
            title="Configuración">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* ── Acciones rápidas — esquina superior derecha ── */}
      <div className="absolute top-4 right-[4.5rem] z-50 flex gap-2">

        {/* Toggle longitud de respuesta */}
        <div className="flex rounded-full border border-white/10 overflow-hidden bg-background/20 backdrop-blur-md">
          {LENGTHS.map(len => (
            <button key={len}
              onClick={() => setResponseLength(len)}
              title={`Respuesta ${len}`}
              className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-mono transition-all
                ${responseLength === len
                  ? 'bg-primary/30 text-primary'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
              {LENGTH_LABELS[len].icon}
              <span className="hidden sm:inline">{LENGTH_LABELS[len].label}</span>
            </button>
          ))}
        </div>

        {/* Compartir última respuesta */}
        <Button variant="ghost" size="icon"
          onClick={shareLastMessage}
          disabled={!lastAiMsg}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20 w-10 h-10 disabled:opacity-25"
          title="Compartir última respuesta">
          <Share2 className="w-4 h-4" />
        </Button>

        {/* Nueva conversación */}
        <Button variant="ghost" size="icon"
          onClick={resetConversation}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20 w-10 h-10"
          title="Nueva conversación (N)">
          <RotateCcw className="w-4 h-4" />
        </Button>

        {/* Guardar */}
        <Button variant="ghost" size="icon"
          onClick={saveConversation}
          disabled={history.length === 0}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20 w-10 h-10 disabled:opacity-25"
          title="Guardar conversación">
          <Save className="w-4 h-4" />
        </Button>

        {/* Selector de tema */}
        <div className="relative">
          <Button variant="ghost" size="icon"
            onClick={() => setShowThemePicker(v => !v)}
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20 w-10 h-10"
            title="Tema de color">
            <Palette className="w-4 h-4" />
          </Button>
          <AnimatePresence>
            {showThemePicker && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.92 }}
                className="absolute top-12 right-0 glass-panel rounded-2xl p-3 border border-white/10 shadow-xl flex flex-col gap-1.5 min-w-[130px] z-50">
                {themes.map(t => (
                  <button key={t.name}
                    onClick={() => { setTheme(t.name as ThemeName); setShowThemePicker(false); }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors text-left
                      ${theme.name === t.name ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white/90'}`}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20"
                      style={{ backgroundColor: t.hex }} />
                    <span className="text-xs font-mono">{t.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nombre del avatar */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
        <motion.p
          key={avatarName}
          initial={{ opacity: 0, letterSpacing: '0.5em' }}
          animate={{ opacity: 0.4, letterSpacing: '0.35em' }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="text-xs font-mono uppercase text-primary">
          {avatarName}
        </motion.p>
      </div>

      {/* ── Avatar — toca dos veces para interrumpir ── */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={handleAvatarTap}
        style={{ cursor: status === 'speaking' ? 'pointer' : 'default' }}>
        <motion.div
          className="w-full h-full flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}>
          <Avatar
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
          />
        </motion.div>
      </div>

      {/* Indicador de pensando — debajo del avatar */}
      <div className="absolute bottom-52 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <ThinkingIndicator active={status === 'thinking'} />
      </div>

      {/* Botón interrumpir AI (lateral derecho) */}
      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div key="interrupt"
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            className="absolute top-1/2 -translate-y-1/2 right-5 z-40">
            <Button onClick={interruptSpeech} size="icon"
              className="rounded-full w-14 h-14 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400
                         shadow-[0_0_20px_rgba(255,60,60,0.3)]"
              title="Interrumpir AI (Esc o doble toque)">
              <StopCircle className="w-7 h-7" />
            </Button>
            <p className="text-[9px] font-mono text-red-400/60 text-center mt-1 uppercase tracking-wider">
              Esc / ✕✕
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtítulo en vivo */}
      <AnimatePresence>
        {status === 'speaking' && lastAiMsg && (
          <motion.div key="caption"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-48 left-1/2 -translate-x-1/2 w-[80%] max-w-xl z-30 pointer-events-none">
            <div className="glass-panel rounded-2xl px-5 py-3 border border-secondary/25 text-center">
              <p className="text-sm text-white/80 font-light leading-relaxed line-clamp-4">{lastAiMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state con indicador */}
      <AnimatePresence>
        {lastError && status === 'idle' && (
          <motion.div key="error"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-48 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
              ⚠ Error — toca el micrófono para reintentar
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controles de voz */}
      <div className="relative z-40">
        <VoiceControl
          status={status}
          isRecording={isRecording}
          isProcessing={isProcessing}
          startRecording={startRecording}
          stopRecording={stopRecording}
          analyser={analyser}
          lastTranscript={lastTranscript}
          handsFree={handsFree}
          onToggleHandsFree={() => setHandsFree(v => !v)}
        />
      </div>

      {/* Panel de transcripción */}
      <div className="relative z-50">
        <TranscriptPanel
          messages={history}
          isOpen={isTranscriptOpen}
          onToggle={handleToggleTranscript}
          unreadCount={unreadCount}
        />
      </div>

      {/* Atajos de teclado */}
      <KeyboardHelp />
    </div>
  );
}
