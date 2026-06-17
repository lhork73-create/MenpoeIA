import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ParticleBackground } from '@/components/ParticleBackground';
import { KeyboardHelp } from '@/components/KeyboardHelp';
import { SessionStats } from '@/components/SessionStats';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { useTheme, THEMES, ThemeName } from '@/hooks/useTheme';
import { useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Settings, History, RotateCcw, Save, StopCircle, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { beepStart } from '@/lib/sounds';

export default function MirrorPage() {
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const {
    isRecording, isProcessing, startRecording, stopRecording,
    history, lastTranscript, analyser,
    interruptSpeech, resetConversation, saveConversation,
    tokensTotal, sessionStart,
  } = useVoicePipeline(setStatus, setSpeakingVolume);

  const { theme, setTheme, themes } = useTheme();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const seenCountRef  = useRef(0);
  const prevStatusRef = useRef(status);
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;

  // ── Mic level from analyser ─────────────────────────────────────────────
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

  // ── Unread count ────────────────────────────────────────────────────────
  const aiCount     = history.filter(m => m.role === 'assistant').length;
  const unreadCount = isTranscriptOpen ? 0 : Math.max(0, aiCount - seenCountRef.current);

  const handleToggleTranscript = () => {
    if (!isTranscriptOpen) seenCountRef.current = aiCount;
    setIsTranscriptOpen(v => !v);
  };
  useEffect(() => {
    if (isTranscriptOpen) seenCountRef.current = aiCount;
  }, [aiCount, isTranscriptOpen]);

  // ── Hands-free mode ──────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === 'speaking' && status === 'idle' && handsFree && !isRecording && !isProcessing) {
      const timer = setTimeout(() => { beepStart(); startRecordingRef.current(); }, 700);
      return () => clearTimeout(timer);
    }
  }, [status, handsFree, isRecording, isProcessing]);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // H — toggle transcript
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleToggleTranscript();
      }
      // N — nueva conversación
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        resetConversation();
      }
      // Esc — interrumpir AI
      if (e.key === 'Escape') {
        if (status === 'speaking') interruptSpeech();
      }
      // M — toggle manos libres
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setHandsFree(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, interruptSpeech, resetConversation]);

  const avatarName = settings?.avatarName ?? 'Mirror';
  const lastAiMsg  = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">

      {/* ① Partículas de fondo flotantes */}
      <ParticleBackground primaryRgb={theme.rgb} />

      {/* Fondo degradado sutil */}
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-1/2 bg-secondary/5 blur-[120px] rounded-full" />
      </div>

      {/* ③ Estadísticas de sesión */}
      <div className="relative z-40">
        <SessionStats
          messageCount={history.length}
          tokensTotal={tokensTotal}
          sessionStart={sessionStart}
        />
      </div>

      {/* Navegación superior izquierda */}
      <div className="absolute top-6 left-6 z-50 flex gap-3">
        <Link href="/history">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20"
            title="Historial (H)">
            <History className="w-5 h-5" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20"
            title="Configuración">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      {/* Acciones rápidas — esquina superior derecha (además del transcript) */}
      <div className="absolute top-6 right-20 z-50 flex gap-3">

        {/* ⑥ Nueva conversación */}
        <Button variant="ghost" size="icon"
          onClick={resetConversation}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20"
          title="Nueva conversación (N)">
          <RotateCcw className="w-4 h-4" />
        </Button>

        {/* ⑩ Guardar conversación */}
        <Button variant="ghost" size="icon"
          onClick={saveConversation}
          disabled={history.length === 0}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20 disabled:opacity-30"
          title="Guardar conversación">
          <Save className="w-4 h-4" />
        </Button>

        {/* ⑧ Selector de tema */}
        <div className="relative">
          <Button variant="ghost" size="icon"
            onClick={() => setShowThemePicker(v => !v)}
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/20"
            title="Cambiar tema de color">
            <Palette className="w-4 h-4" />
          </Button>

          <AnimatePresence>
            {showThemePicker && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.92 }}
                className="absolute top-12 right-0 glass-panel rounded-2xl p-3 border border-white/10 shadow-xl flex flex-col gap-2 min-w-[140px]">
                <p className="text-[10px] font-mono uppercase text-white/40 tracking-widest px-1 mb-1">Tema</p>
                {themes.map(t => (
                  <button key={t.name}
                    onClick={() => { setTheme(t.name as ThemeName); setShowThemePicker(false); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left
                      ${theme.name === t.name ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white/90'}`}>
                    <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-white/20"
                      style={{ backgroundColor: t.hex }} />
                    <span className="text-xs font-mono">{t.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ④ Nombre del avatar con efecto typewriter */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={avatarName}
            initial={{ opacity: 0, letterSpacing: '0.5em' }}
            animate={{ opacity: 0.45, letterSpacing: '0.35em' }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="text-xs font-mono uppercase tracking-[0.35em] text-primary">
            {avatarName}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Avatar principal */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <motion.div
          className="w-[120%] h-[120%] md:w-full md:h-full flex items-center justify-center pointer-events-auto"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}>
          {/* ② + ① Avatar con micLevel y tema */}
          <Avatar
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
          />
        </motion.div>
      </div>

      {/* ⑦ Botón interrumpir AI */}
      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div key="interrupt"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/2 -translate-y-1/2 right-8 z-40">
            <Button
              onClick={interruptSpeech}
              size="icon"
              className="rounded-full w-14 h-14 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400
                         shadow-[0_0_20px_rgba(255,60,60,0.3)] transition-all"
              title="Interrumpir AI (Esc)">
              <StopCircle className="w-7 h-7" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtítulo en vivo */}
      <AnimatePresence>
        {status === 'speaking' && lastAiMsg && (
          <motion.div key="caption"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-44 left-1/2 -translate-x-1/2 w-[72%] max-w-xl z-30 pointer-events-none">
            <div className="glass-panel rounded-2xl px-5 py-3 border border-secondary/25 text-center">
              <p className="text-sm text-white/75 font-light leading-relaxed line-clamp-4">
                {lastAiMsg}
              </p>
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

      {/* ⑨ Panel de atajos de teclado */}
      <KeyboardHelp />
    </div>
  );
}
