import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ParticleBackground } from '@/components/ParticleBackground';
import { KeyboardHelp } from '@/components/KeyboardHelp';
import { ThinkingIndicator } from '@/components/ThinkingIndicator';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { useTheme } from '@/hooks/useTheme';
import { useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { getSavedSettings } from '@/lib/settingsStorage';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Settings, History, RotateCcw, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vibrateStart } from '@/lib/haptic';
import { useToast } from '@/hooks/use-toast';

export default function MirrorPage() {
  const { toast } = useToast();
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const {
    isRecording, isProcessing, startRecording, stopRecording,
    sendTextMessage,
    history, lastTranscript, lastError,
    analyser, interruptSpeech, resetConversation,
  } = useVoicePipeline(setStatus, setSpeakingVolume);

  const { theme } = useTheme();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [micLevel,         setMicLevel]         = useState(0);

  const seenCountRef        = useRef(0);
  const prevStatusRef       = useRef(status);
  const startRecordingRef   = useRef(startRecording);
  const interruptRef        = useRef(interruptSpeech);
  const resetRef            = useRef(resetConversation);
  startRecordingRef.current = startRecording;
  interruptRef.current      = interruptSpeech;
  resetRef.current          = resetConversation;

  const touchStartX = useRef(0);

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

  // ── Feedback háptico al cambiar de estado ──────────────────────────────────
  useEffect(() => {
    if (status === 'listening' && prevStatusRef.current !== 'listening') {
      vibrateStart();
    }
    prevStatusRef.current = status;
  }, [status]);

  // ── Tap en el avatar ──────────────────────────────────────────────────────
  const handleAvatarTap = () => {
    if (status === 'speaking') {
      interruptSpeech();
      toast({ title: 'Silenciado', description: 'Has interrumpido la respuesta.' });
    }
  };

  // ── Envío de texto ────────────────────────────────────────────────────────
  const handleTextSubmit = (text: string) => {
    sendTextMessage(text);
  };

  // ── Teclas globales ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startRecordingRef.current();
      }
      if (e.code === 'Escape') {
        interruptRef.current();
      }
      if (e.key === 'h' || e.key === 'H') {
        handleToggleTranscript();
      }
      if (e.key === 'n' || e.key === 'N') {
        resetRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleTranscript]);

  // ── Swipe ─────────────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (dx > 60 && !isTranscriptOpen)  handleToggleTranscript();
    if (dx < -60 && isTranscriptOpen)  handleToggleTranscript();
  };

  const saved = getSavedSettings();
  const avatarName = (settings && typeof settings === 'object' && 'avatarName' in settings && (settings as any).avatarName)
    ? (settings as any).avatarName
    : saved.avatarName;
  const lastAiMsg  = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';

  return (
    <div
      className="fixed inset-0 w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-background select-none touch-none overscroll-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <ParticleBackground primaryRgb={theme.rgb} />

      {/* Atmospheric lighting glow */}
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/3 h-1/3 bg-secondary/5 blur-[120px] rounded-full" />
      </div>

      {/* ── Header Limpio y Minimalista ── */}
      <header className="absolute top-3 left-4 right-4 sm:top-5 sm:left-6 sm:right-6 z-50 flex items-center justify-between pointer-events-none">
        {/* Branding & Status */}
        <div className="flex items-center gap-2.5 sm:gap-3 pointer-events-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          <span className="text-xs sm:text-sm font-mono font-bold tracking-[0.25em] text-white/90 uppercase">
            {avatarName}
          </span>
          <span className="text-[9px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest hidden sm:inline">
            EN LÍNEA
          </span>
        </div>

        {/* Acciones Esenciales */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Nueva conversación */}
          <Button
            variant="ghost"
            size="icon"
            onClick={resetConversation}
            className="rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/10 w-8 h-8 sm:w-9 sm:h-9"
            title="Nueva conversación (N)"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>

          {/* Configuración */}
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/10 w-8 h-8 sm:w-9 sm:h-9"
              title="Configuración"
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </Link>

          {/* Historial / Transcripción */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleTranscript}
            className="relative rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-white/10 w-8 h-8 sm:w-9 sm:h-9"
            title="Historial de mensajes (H)"
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-mono text-black font-bold flex items-center justify-center shadow-[0_0_8px_rgba(0,210,255,0.8)]">
                {unreadCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* ── Avatar 3D Personalizado ── */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={handleAvatarTap}
        style={{ cursor: status === 'speaking' ? 'pointer' : 'default' }}>
        <motion.div className="w-full h-full flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}>
          <Avatar
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
          />
        </motion.div>
      </div>

      {/* Indicador de Pensando */}
      <div className="absolute bottom-36 sm:bottom-44 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <ThinkingIndicator active={status === 'thinking'} />
      </div>

      {/* Botón Flotante para Interrumpir */}
      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div key="intr"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="absolute top-1/2 -translate-y-1/2 right-4 sm:right-6 z-40 flex flex-col items-center gap-1">
            <Button onClick={interruptSpeech} size="icon"
              className="rounded-full w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(255,50,50,0.3)]"
              title="Interrumpir (Esc)">
              <StopCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
            <p className="text-[9px] font-mono text-red-400/50 uppercase tracking-wider hidden sm:block">Esc</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtítulos de la Respuesta de IA */}
      <AnimatePresence>
        {status === 'speaking' && lastAiMsg && (
          <motion.div key="cap"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-36 sm:bottom-44 left-1/2 -translate-x-1/2 w-[90%] sm:w-[85%] max-w-lg z-30 pointer-events-none">
            <div className="glass-panel rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 border border-white/10 text-center shadow-2xl backdrop-blur-xl bg-black/50">
              <p className="text-xs sm:text-sm text-white/90 font-light leading-relaxed line-clamp-3">{lastAiMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alerta de Error amigable */}
      <AnimatePresence>
        {lastError && !isProcessing && !isRecording && (
          <motion.div key="err"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-36 sm:bottom-44 left-1/2 -translate-x-1/2 z-30 max-w-xs w-[88%]">
            <div className="px-4 py-2 rounded-full bg-red-900/60 border border-red-500/40 text-red-200 text-xs font-mono text-center shadow-lg">
              ⚠ {lastError}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Controles de voz y texto inferiores ── */}
      <div className="relative z-40">
        <VoiceControl
          status={status}
          isRecording={isRecording}
          isProcessing={isProcessing}
          startRecording={startRecording}
          stopRecording={stopRecording}
          analyser={analyser}
          lastTranscript={lastTranscript}
          onTextSubmit={handleTextSubmit}
        />
      </div>

      {/* ── Panel lateral de Transcripción ── */}
      <div className="relative z-50">
        <TranscriptPanel
          messages={history}
          isOpen={isTranscriptOpen}
          onToggle={handleToggleTranscript}
          unreadCount={unreadCount}
        />
      </div>

      <KeyboardHelp />
    </div>
  );
}
