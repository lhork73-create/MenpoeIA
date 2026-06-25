import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar, AvatarMode, AvatarGender } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ParticleBackground } from '@/components/ParticleBackground';
import { KeyboardHelp } from '@/components/KeyboardHelp';
import { SessionStats } from '@/components/SessionStats';
import { ThinkingIndicator } from '@/components/ThinkingIndicator';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline, ResponseLength } from '@/hooks/useVoicePipeline';
import { useTheme, ThemeName } from '@/hooks/useTheme';
import { useGetSettings, getGetSettingsQueryKey, useSendChat } from '@workspace/api-client-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import {
  Settings, History, RotateCcw, Save, StopCircle,
  Palette, Share2, AlignLeft, AlignCenter, AlignJustify,
  Download, Gauge, Volume2, Sparkles, User, UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vibrateStart } from '@/lib/haptic';
import { useToast } from '@/hooks/use-toast';

const LENGTH_ICONS: Record<ResponseLength, React.ReactNode> = {
  corta: <AlignLeft   className="w-3.5 h-3.5" />,
  media: <AlignCenter className="w-3.5 h-3.5" />,
  larga: <AlignJustify className="w-3.5 h-3.5" />,
};
const LENGTHS: ResponseLength[] = ['corta', 'media', 'larga'];

// Persist avatar mode + gender across sessions
const getStoredMode   = (): AvatarMode   => (localStorage.getItem('avatarMode')   as AvatarMode)   || 'particle';
const getStoredGender = (): AvatarGender => (localStorage.getItem('avatarGender') as AvatarGender) || 'female';

export default function MirrorPage() {
  const { toast } = useToast();
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const {
    isRecording, isProcessing, startRecording, stopRecording,
    history, lastTranscript, lastError,
    analyser, interruptSpeech, resetConversation, saveConversation, exportConversation,
    tokensTotal, sessionStart,
    responseLength, setResponseLength,
    ttsSpeed, setTtsSpeed,
  } = useVoicePipeline(setStatus, setSpeakingVolume);

  const { theme, setTheme, themes } = useTheme();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const chatMutation = useSendChat();

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [handsFree,        setHandsFree]        = useState(false);
  const [showThemePicker,  setShowThemePicker]  = useState(false);
  const [showSpeedPanel,   setShowSpeedPanel]   = useState(false);
  const [showAvatarPanel,  setShowAvatarPanel]  = useState(false);
  const [micLevel,         setMicLevel]         = useState(0);
  const [avatarMode,       setAvatarModeState]  = useState<AvatarMode>(getStoredMode);
  const [avatarGender,     setAvatarGenderState]= useState<AvatarGender>(getStoredGender);

  const setAvatarMode = (m: AvatarMode) => {
    setAvatarModeState(m);
    localStorage.setItem('avatarMode', m);
  };
  const setAvatarGender = (g: AvatarGender) => {
    setAvatarGenderState(g);
    localStorage.setItem('avatarGender', g);
  };

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

  // ── Manos libres ──────────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === 'speaking' && status === 'idle' && handsFree) {
      const t = setTimeout(() => { vibrateStart(); startRecordingRef.current(); }, 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, handsFree]);

  // ── Doble toque para interrumpir ──────────────────────────────────────────
  const lastTapRef = useRef(0);
  const handleAvatarTap = useCallback(() => {
    if (status !== 'speaking') return;
    const now = Date.now();
    if (now - lastTapRef.current < 400) interruptRef.current();
    lastTapRef.current = now;
  }, [status]);

  // ── Envío de texto ────────────────────────────────────────────────────────
  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;
    interruptRef.current();
    try {
      await chatMutation.mutateAsync({
        data: { message: text, history, systemPrompt: settings?.systemPrompt ?? undefined },
      });
    } catch {
      setStatus('idle');
    }
  }, [isProcessing, history, chatMutation, settings, setStatus]);

  // ── Compartir ─────────────────────────────────────────────────────────────
  const shareLastMessage = useCallback(() => {
    const last = [...history].reverse().find(m => m.role === 'assistant')?.content;
    if (!last) return;
    if (navigator.share) {
      navigator.share({ title: 'Mirror AI', text: last }).catch(() => {});
    } else {
      navigator.clipboard.writeText(last).then(() =>
        toast({ title: 'Copiado al portapapeles ✓' })
      ).catch(() => {});
    }
  }, [history, toast]);

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); handleToggleTranscript(); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); resetRef.current(); }
      if (e.key === 'Escape') interruptRef.current();
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setHandsFree(v => !v); }
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

  const avatarName = settings?.avatarName ?? 'Mirror';
  const lastAiMsg  = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-background"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <ParticleBackground primaryRgb={theme.rgb} />

      <div className="fixed inset-0 pointer-events-none z-[1]">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-primary/5 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/3 h-1/3 bg-secondary/5 blur-[100px] rounded-full" />
      </div>

      {/* Stats */}
      <div className="relative z-40">
        <SessionStats messageCount={history.length} tokensTotal={tokensTotal} sessionStart={sessionStart} />
      </div>

      {/* ── Nav izquierda ── */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <Link href="/history">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10" title="Historial">
            <History className="w-4 h-4" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon"
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10" title="Configuración">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* ── Toolbar derecha ── */}
      <div className="absolute top-4 right-[4.5rem] z-50 flex items-center gap-2 flex-wrap justify-end">

        {/* Avatar mode + gender picker */}
        <div className="relative">
          <Button variant="ghost" size="icon"
            onClick={() => setShowAvatarPanel(v => !v)}
            title="Tipo de avatar"
            className={`rounded-full bg-background/20 backdrop-blur-md border w-10 h-10 transition-all ${
              avatarMode === 'realistic'
                ? 'border-primary/60 text-primary bg-primary/10'
                : 'border-white/10 text-white/60 hover:text-white hover:bg-white/15'
            }`}>
            <Sparkles className="w-4 h-4" />
          </Button>
          <AnimatePresence>
            {showAvatarPanel && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.94 }}
                className="absolute top-12 right-0 glass-panel rounded-2xl p-4 border border-white/10 shadow-xl w-56 z-50">
                <p className="text-[10px] font-mono uppercase text-primary/70 mb-3 tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Avatar
                </p>

                {/* Mode toggle */}
                <div className="flex rounded-xl overflow-hidden border border-white/10 mb-3">
                  {(['particle', 'realistic'] as AvatarMode[]).map(m => (
                    <button key={m}
                      onClick={() => { setAvatarMode(m); if (m === 'realistic') setShowAvatarPanel(false); }}
                      className={`flex-1 py-2 text-[11px] font-mono transition-all ${
                        avatarMode === m ? 'bg-primary/30 text-primary' : 'text-white/40 hover:text-white/70'
                      }`}>
                      {m === 'particle' ? '✦ Partículas' : '◉ Realista'}
                    </button>
                  ))}
                </div>

                {/* Gender (only for realistic) */}
                <AnimatePresence>
                  {avatarMode === 'realistic' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <p className="text-[10px] font-mono uppercase text-white/40 mb-2 tracking-wider">Género</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAvatarGender('female')}
                          className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-xs font-mono ${
                            avatarGender === 'female'
                              ? 'border-pink-400/60 bg-pink-500/15 text-pink-300'
                              : 'border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5'
                          }`}>
                          <UserRound className="w-5 h-5" />
                          <span>Mujer</span>
                        </button>
                        <button
                          onClick={() => setAvatarGender('male')}
                          className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-xs font-mono ${
                            avatarGender === 'male'
                              ? 'border-blue-400/60 bg-blue-500/15 text-blue-300'
                              : 'border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5'
                          }`}>
                          <User className="w-5 h-5" />
                          <span>Hombre</span>
                        </button>
                      </div>
                      <p className="text-[9px] text-white/25 mt-2 text-center font-mono">
                        Cargando modelo 3D…
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Longitud de respuesta */}
        <div className="flex rounded-full border border-white/10 overflow-hidden bg-black/30 backdrop-blur-md">
          {LENGTHS.map(len => (
            <button key={len} onClick={() => setResponseLength(len)} title={`Respuesta ${len}`}
              className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-mono transition-all ${
                responseLength === len ? 'bg-primary/30 text-primary' : 'text-white/35 hover:text-white/70 hover:bg-white/5'
              }`}>
              {LENGTH_ICONS[len]}
              <span className="hidden sm:inline capitalize">{len}</span>
            </button>
          ))}
        </div>

        {/* Velocidad TTS */}
        <div className="relative">
          <Button variant="ghost" size="icon"
            onClick={() => setShowSpeedPanel(v => !v)}
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10" title="Velocidad de voz">
            <Gauge className="w-4 h-4" />
          </Button>
          <AnimatePresence>
            {showSpeedPanel && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="absolute top-12 right-0 glass-panel rounded-2xl p-4 border border-white/10 shadow-xl w-52 z-50">
                <p className="text-[10px] font-mono uppercase text-primary/70 mb-3 tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3" /> Velocidad TTS
                </p>
                <input type="range" min={0.7} max={2.0} step={0.1} value={ttsSpeed}
                  onChange={e => setTtsSpeed(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer" />
                <div className="flex justify-between text-[10px] text-white/40 font-mono mt-1">
                  <span>Lento</span>
                  <span className="text-primary">{ttsSpeed.toFixed(1)}×</span>
                  <span>Rápido</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Compartir */}
        <Button variant="ghost" size="icon" onClick={shareLastMessage} disabled={!lastAiMsg}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10 disabled:opacity-25" title="Compartir">
          <Share2 className="w-4 h-4" />
        </Button>

        {/* Nueva conversación */}
        <Button variant="ghost" size="icon" onClick={resetConversation}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10" title="Nueva (N)">
          <RotateCcw className="w-4 h-4" />
        </Button>

        {/* Guardar */}
        <Button variant="ghost" size="icon" onClick={saveConversation} disabled={history.length === 0}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10 disabled:opacity-25" title="Guardar">
          <Save className="w-4 h-4" />
        </Button>

        {/* Exportar */}
        <Button variant="ghost" size="icon" onClick={exportConversation} disabled={history.length === 0}
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10 disabled:opacity-25" title="Exportar .txt">
          <Download className="w-4 h-4" />
        </Button>

        {/* Tema */}
        <div className="relative">
          <Button variant="ghost" size="icon" onClick={() => setShowThemePicker(v => !v)}
            className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/15 w-10 h-10" title="Tema">
            <Palette className="w-4 h-4" />
          </Button>
          <AnimatePresence>
            {showThemePicker && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.94 }}
                className="absolute top-12 right-0 glass-panel rounded-2xl p-3 border border-white/10 shadow-xl flex flex-col gap-1 min-w-[130px] z-50">
                {themes.map(t => (
                  <button key={t.name} onClick={() => { setTheme(t.name as ThemeName); setShowThemePicker(false); }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-mono transition-colors ${
                      theme.name === t.name ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/8 hover:text-white/90'
                    }`}>
                    <span className="w-3 h-3 rounded-full ring-1 ring-white/20" style={{ backgroundColor: t.hex }} />
                    {t.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nombre del avatar */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
        <motion.p key={avatarName}
          initial={{ opacity: 0, letterSpacing: '0.6em' }}
          animate={{ opacity: 0.35, letterSpacing: '0.35em' }}
          transition={{ duration: 1.4 }}
          className="text-xs font-mono uppercase text-primary">
          {avatarName}
        </motion.p>
        {avatarMode === 'realistic' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.25 }}
            className="text-[9px] font-mono uppercase text-white/30 tracking-widest mt-0.5">
            {avatarGender === 'female' ? '♀ Mujer · 3D' : '♂ Hombre · 3D'}
          </motion.p>
        )}
      </div>

      {/* ── Avatar ── */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={handleAvatarTap}
        style={{ cursor: status === 'speaking' ? 'pointer' : 'default' }}>
        <motion.div className="w-full h-full flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}>
          <Avatar
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
            mode={avatarMode}
            gender={avatarGender}
          />
        </motion.div>
      </div>

      {/* Pensando */}
      <div className="absolute bottom-52 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <ThinkingIndicator active={status === 'thinking'} />
      </div>

      {/* Botón interrumpir */}
      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div key="intr"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="absolute top-1/2 -translate-y-1/2 right-5 z-40 flex flex-col items-center gap-1">
            <Button onClick={interruptSpeech} size="icon"
              className="rounded-full w-14 h-14 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(255,50,50,0.3)]"
              title="Interrumpir (Esc)">
              <StopCircle className="w-7 h-7" />
            </Button>
            <p className="text-[9px] font-mono text-red-400/50 uppercase tracking-wider">Esc</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtítulo en vivo */}
      <AnimatePresence>
        {status === 'speaking' && lastAiMsg && (
          <motion.div key="cap"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-52 left-1/2 -translate-x-1/2 w-[80%] max-w-xl z-30 pointer-events-none">
            <div className="glass-panel rounded-2xl px-5 py-3 border border-secondary/20 text-center">
              <p className="text-sm text-white/80 font-light leading-relaxed line-clamp-3">{lastAiMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {lastError && !isProcessing && !isRecording && (
          <motion.div key="err"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-52 left-1/2 -translate-x-1/2 z-30 max-w-xs">
            <div className="px-4 py-2 rounded-full bg-red-900/40 border border-red-500/40 text-red-300 text-xs font-mono text-center">
              ⚠ {lastError}
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
          onTextSubmit={handleTextSubmit}
        />
      </div>

      {/* Transcripción */}
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
