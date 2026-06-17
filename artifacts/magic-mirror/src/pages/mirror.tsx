import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Settings, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { beepStart } from '@/lib/sounds';

export default function MirrorPage() {
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const {
    isRecording, isProcessing, startRecording, stopRecording,
    history, lastTranscript, analyser,
  } = useVoicePipeline(setStatus, setSpeakingVolume);

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const seenCountRef  = useRef(0);
  const prevStatusRef = useRef(status);

  // ── Conteo de mensajes no leídos ────────────────────────────────────────
  const aiCount    = history.filter(m => m.role === 'assistant').length;
  const unreadCount = isTranscriptOpen ? 0 : Math.max(0, aiCount - seenCountRef.current);

  const handleToggleTranscript = () => {
    if (!isTranscriptOpen) seenCountRef.current = aiCount;
    setIsTranscriptOpen(v => !v);
  };

  useEffect(() => {
    if (isTranscriptOpen) seenCountRef.current = aiCount;
  }, [aiCount, isTranscriptOpen]);

  // ── Modo manos libres: reinicia grabación después de que el AI habla ────
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev === 'speaking' && status === 'idle' && handsFree && !isRecording && !isProcessing) {
      const timer = setTimeout(() => {
        beepStart();
        startRecordingRef.current();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [status, handsFree, isRecording, isProcessing]);

  // ── Último mensaje del AI (subtítulo en vivo) ───────────────────────────
  const lastAiMessage = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">

      {/* Navegación superior */}
      <div className="absolute top-6 left-6 z-50 flex gap-4">
        <Link href="/history">
          <Button variant="ghost" size="icon" className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20"
            title="Historial">
            <History className="w-5 h-5" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20"
            title="Configuración">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      {/* Avatar principal */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="w-[120%] h-[120%] md:w-full md:h-full flex items-center justify-center pointer-events-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
        >
          <Avatar status={status} mouthOpenAmount={mouthOpenAmount} />
        </motion.div>
      </div>

      {/* Subtítulo en vivo del AI mientras habla */}
      <AnimatePresence>
        {status === 'speaking' && lastAiMessage && (
          <motion.div key="caption"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-44 left-1/2 -translate-x-1/2 w-[72%] max-w-xl z-30 pointer-events-none">
            <div className="glass-panel rounded-2xl px-5 py-3 border border-secondary/25 text-center">
              <p className="text-sm text-white/75 font-light leading-relaxed line-clamp-4">
                {lastAiMessage}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controles de voz */}
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

      {/* Panel de transcripción */}
      <TranscriptPanel
        messages={history}
        isOpen={isTranscriptOpen}
        onToggle={handleToggleTranscript}
        unreadCount={unreadCount}
      />
    </div>
  );
}
