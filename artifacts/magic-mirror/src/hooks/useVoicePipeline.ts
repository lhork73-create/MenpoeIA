import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useTranscribeAudio,
  useSendChat,
  useGetSettings,
  useSaveConversation,
  getGetSettingsQueryKey,
} from '@workspace/api-client-react';
import { ChatMessage } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { AvatarStatus } from './useAvatarState';
import { vibrateError } from '@/lib/haptic';
import { generateGeminiReply } from '@/lib/gemini';

export type ResponseLength = 'corta' | 'media' | 'larga';

const LENGTH_INSTRUCTION: Record<ResponseLength, string> = {
  corta: '\n\nIMPORTANTE: Sé MUY breve: máximo 1-2 oraciones cortas.',
  media: '',
  larga: '\n\nIMPORTANTE: Puedes dar una respuesta detallada y completa.',
};

// Prioridad de formatos de audio soportados por el navegador
const MIME_PRIORITY = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  '',
];

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of MIME_PRIORITY) {
    if (!mime || MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const hasSpeech = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

const safeCancel = () => {
  try { if (hasSpeech()) window.speechSynthesis.cancel(); } catch {}
};

function getBestVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  const checks = [
    (v: SpeechSynthesisVoice) => /neural|natural/i.test(v.name) && v.lang.startsWith('es'),
    (v: SpeechSynthesisVoice) => !v.localService && v.lang.startsWith('es'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('es-MX'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('es-ES'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('es'),
    (v: SpeechSynthesisVoice) => !v.localService && v.lang.startsWith('en'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('en'),
  ];
  for (const check of checks) {
    const found = voices.find(check);
    if (found) return found;
  }
  return voices[0] ?? null;
}

export function useVoicePipeline(
  setStatus: (s: AvatarStatus) => void,
  setSpeakingVolume: (v: number) => void,
) {
  const { toast } = useToast();

  const [isRecording,    setIsRecording]    = useState(false);
  const [isProcessing,   setIsProcessing]   = useState(false);
  const [history,        setHistory]        = useState<ChatMessage[]>([]);
  const [lastTranscript, setLastTranscript] = useState('');
  const [tokensTotal,    setTokensTotal]    = useState(0);
  const [sessionStart,   setSessionStart]   = useState<number | null>(null);
  const [responseLength, setResponseLength] = useState<ResponseLength>('media');
  const [lastError,      setLastError]      = useState<string | null>(null);
  const [ttsSpeed,       setTtsSpeed]       = useState(1.0);

  // Refs — no causan re-render y no tienen problema de closure obsoleto
  const historyRef        = useRef<ChatMessage[]>([]);
  const isRecordingRef    = useRef(false);
  const isProcessingRef   = useRef(false);
  const responseLenRef    = useRef<ResponseLength>('media');
  const ttsSpeedRef       = useRef(1.0);
  const savedRef          = useRef(false);

  historyRef.current      = history;
  isRecordingRef.current  = isRecording;
  isProcessingRef.current = isProcessing;
  responseLenRef.current  = responseLength;
  ttsSpeedRef.current     = ttsSpeed;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef   = useRef<MediaStream | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const ttsAnimRef            = useRef<number | null>(null);
  const silenceTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transcribeMutation = useTranscribeAudio();
  const chatMutation       = useSendChat();
  const saveMutation       = useSaveConversation();

  // ── TTS ──────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!hasSpeech()) { resolve(); return; }
      safeCancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate   = Math.max(0.7, Math.min(2.0, ttsSpeedRef.current));
      utter.pitch  = 1.0;
      utter.volume = 1.0;
      utter.lang   = 'es-MX';

      const applyVoice = () => {
        const v = getBestVoice();
        if (v) utter.voice = v;
      };
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', applyVoice, { once: true });
      } else {
        applyVoice();
      }

      setStatus('speaking');
      let t = 0;
      const animMouth = () => {
        t += 0.15;
        const wave = Math.max(0, Math.sin(t) * 0.65 + Math.sin(t * 1.9) * 0.35);
        setSpeakingVolume(wave);
        ttsAnimRef.current = requestAnimationFrame(animMouth);
      };

      utter.onstart = () => {
        if (ttsAnimRef.current) cancelAnimationFrame(ttsAnimRef.current);
        animMouth();
      };

      const finish = () => {
        if (ttsAnimRef.current) { cancelAnimationFrame(ttsAnimRef.current); ttsAnimRef.current = null; }
        setSpeakingVolume(0);
        setStatus('idle');
        resolve();
      };

      utter.onend   = finish;
      utter.onerror = finish;

      try {
        window.speechSynthesis.speak(utter);
      } catch {
        finish();
      }
    });
  }, [setStatus, setSpeakingVolume]);

  // ── Limpieza de audio ────────────────────────────────────────────────────
  const cleanupAudio = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // ── Procesar blob de audio ────────────────────────────────────────────────
  const handleAudioBlob = useCallback(async (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    setLastError(null);
    setStatus('thinking');

    try {
      const recDuration = Date.now() - recordingStartTimeRef.current;
      if (blob.size < 600 || recDuration < 700) {
        // Toque accidental o ultracorto: cancelar limpiamente sin alarma
        setStatus('idle');
        setIsProcessing(false);
        toast({
          title: 'Audio muy breve',
          description: 'Toca el micrófono para empezar a hablar, y tócalo de nuevo al terminar para enviar.',
        });
        return;
      }

      const base64 = await blobToBase64(blob);

      if (!base64 || base64.length < 100) {
        setStatus('idle');
        setIsProcessing(false);
        return;
      }

      const transcribeRes = await transcribeMutation.mutateAsync({
        data: { audioBase64: base64, mimeType: mimeType || 'audio/webm' },
      });

      const userText = transcribeRes.text?.trim() ?? '';
      if (!userText) {
        setStatus('idle');
        setIsProcessing(false);
        toast({
          title: 'Sin voz detectada',
          description: 'No se escuchó voz con claridad. Habla cerca del micrófono e intenta de nuevo.',
        });
        return;
      }

      setLastTranscript(userText);
      if (!sessionStart) setSessionStart(Date.now());

      const userMsg: ChatMessage = { role: 'user' as const, content: userText };
      const updatedHistory = [...historyRef.current, userMsg];
      setHistory(updatedHistory);

      const basePrompt  = settingsRef.current?.systemPrompt ?? undefined;
      const lengthExtra = LENGTH_INSTRUCTION[responseLenRef.current];
      const finalPrompt = basePrompt ? basePrompt + lengthExtra : undefined;

      let replyMessage = '';
      let replyTokens = 0;

      try {
        const geminiRes = await generateGeminiReply(userText, historyRef.current, finalPrompt);
        replyMessage = geminiRes.text;
        replyTokens = geminiRes.tokensUsed;
      } catch (geminiErr) {
        console.warn('[VoicePipeline] Gemini client call failed, trying backend...', geminiErr);
        const chatRes = await chatMutation.mutateAsync({
          data: { message: userText, history: historyRef.current, systemPrompt: finalPrompt },
        });
        replyMessage = chatRes.message;
        replyTokens = chatRes.tokensUsed ?? 0;
      }

      const aiMsg: ChatMessage = { role: 'assistant' as const, content: replyMessage };
      const finalHistory = [...updatedHistory, aiMsg];
      setHistory(finalHistory);
      setTokensTotal(prev => prev + replyTokens);
      setIsProcessing(false);

      await speak(replyMessage);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.';
      setLastError(msg);
      vibrateError();
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [transcribeMutation, chatMutation, speak, toast, setStatus, sessionStart]);

  // ── Detener grabación ────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) { setIsRecording(false); return; }

    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    if (recorder.state === 'recording') {
      recorder.stop(); // dispara onstop → handleAudioBlob
    }

    cleanupAudio();
    setIsRecording(false);
    mediaRecorderRef.current = null;
  }, [cleanupAudio]);

  // ── Iniciar grabación ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isProcessingRef.current) return;

    safeCancel();
    setLastError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Tu navegador no soporta grabación de audio. Usa Chrome o Safari en iOS 14.3+.';
      setLastError(msg);
      toast({ title: 'Navegador no compatible', description: msg, variant: 'destructive' });
      return;
    }

    setStatus('listening');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      audioStreamRef.current = stream;

      // Analyser para visualización
      try {
        const AudioCtxClass = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtxClass();
        audioCtxRef.current = ctx;
        const source   = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        // Si el AudioContext falla en iOS, continuar sin visualización
        analyserRef.current = null;
      }

      const mimeType = getSupportedMimeType();
      const recOptions = mimeType ? { mimeType } : {};
      const chunks: Blob[] = [];

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recOptions);
      } catch {
        // Reintentar sin opciones de mimeType
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalMime });
        handleAudioBlob(blob, finalMime);
      };

      recorder.onerror = () => {
        cleanupAudio();
        setIsRecording(false);
        setStatus('idle');
        mediaRecorderRef.current = null;
        toast({ title: 'Error de grabación', description: 'Intenta de nuevo.', variant: 'destructive' });
      };

      // timeslice: recoger datos cada 250ms para chunks más pequeños y fiables
      recordingStartTimeRef.current = Date.now();
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Auto-detener a los 45 segundos máximo
      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) stopRecording();
      }, 45_000);

    } catch (err) {
      cleanupAudio();
      setStatus('idle');
      const msg = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Permiso de micrófono denegado. Permite el acceso al micrófono en tu navegador.'
        : 'No se pudo acceder al micrófono. Comprueba que no esté en uso por otra app.';
      setLastError(msg);
      vibrateError();
      toast({ title: 'Error de micrófono', description: msg, variant: 'destructive' });
    }
  }, [handleAudioBlob, stopRecording, cleanupAudio, setStatus, toast]);

  // ── Interrumpir TTS ───────────────────────────────────────────────────────
  const interruptSpeech = useCallback(() => {
    if (ttsAnimRef.current) { cancelAnimationFrame(ttsAnimRef.current); ttsAnimRef.current = null; }
    setSpeakingVolume(0);
    safeCancel();
    setStatus('idle');
  }, [setStatus, setSpeakingVolume]);

  // ── Enviar mensaje por texto ──────────────────────────────────────────────
  const sendTextMessage = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isProcessingRef.current) return;

    interruptSpeech();
    setIsProcessing(true);
    setLastError(null);
    setStatus('thinking');

    try {
      setLastTranscript(trimmed);
      if (!sessionStart) setSessionStart(Date.now());

      const userMsg: ChatMessage = { role: 'user' as const, content: trimmed };
      const currentHistory = historyRef.current;
      const updatedHistory = [...currentHistory, userMsg];
      setHistory(updatedHistory);

      const basePrompt  = settingsRef.current?.systemPrompt ?? undefined;
      const lengthExtra = LENGTH_INSTRUCTION[responseLenRef.current];
      const finalPrompt = basePrompt ? basePrompt + lengthExtra : undefined;

      let replyMessage = '';
      let replyTokens = 0;

      try {
        const geminiRes = await generateGeminiReply(trimmed, currentHistory, finalPrompt);
        replyMessage = geminiRes.text;
        replyTokens = geminiRes.tokensUsed;
      } catch (geminiErr) {
        console.warn('[VoicePipeline] Gemini client call failed, trying backend...', geminiErr);
        const chatRes = await chatMutation.mutateAsync({
          data: { message: trimmed, history: currentHistory, systemPrompt: finalPrompt },
        });
        replyMessage = chatRes.message;
        replyTokens = chatRes.tokensUsed ?? 0;
      }

      const aiMsg: ChatMessage = { role: 'assistant' as const, content: replyMessage };
      const finalHistory = [...updatedHistory, aiMsg];
      setHistory(finalHistory);
      setTokensTotal(prev => prev + replyTokens);
      setIsProcessing(false);

      await speak(replyMessage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.';
      setLastError(msg);
      vibrateError();
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [chatMutation, speak, toast, setStatus, sessionStart, interruptSpeech]);

  // ── Resetear conversación ─────────────────────────────────────────────────
  const resetConversation = useCallback(() => {
    interruptSpeech();
    setHistory([]);
    setLastTranscript('');
    setTokensTotal(0);
    setSessionStart(null);
    setLastError(null);
    savedRef.current = false;
  }, [interruptSpeech]);

  // ── Guardar conversación ──────────────────────────────────────────────────
  const saveConversation = useCallback(() => {
    const msgs = historyRef.current;
    if (msgs.length === 0) {
      toast({ title: 'Sin mensajes', description: 'Habla primero para guardar.', variant: 'destructive' });
      return;
    }
    savedRef.current = true;
    const title = msgs.find(m => m.role === 'user')?.content.slice(0, 50)
      || `Chat ${new Date().toLocaleDateString('es-MX')}`;
    saveMutation.mutate({ data: { title, messages: msgs } });
    toast({ title: 'Conversación guardada ✓', description: 'Disponible en el historial.' });
  }, [saveMutation, toast]);

  // ── Exportar como .txt ────────────────────────────────────────────────────
  const exportConversation = useCallback(() => {
    const msgs = historyRef.current;
    if (msgs.length === 0) {
      toast({ title: 'Sin mensajes', description: 'Habla primero para exportar.', variant: 'destructive' });
      return;
    }
    const lines = msgs.map(m =>
      `[${m.role === 'user' ? 'Tú' : 'Mirror AI'}]\n${m.content}`
    ).join('\n\n---\n\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mirror-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Conversación exportada ✓' });
  }, [toast]);

  // ── Limpiar al desmontar ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      safeCancel();
      if (ttsAnimRef.current) cancelAnimationFrame(ttsAnimRef.current);
      cleanupAudio();
      const msgs = historyRef.current;
      if (msgs.length > 0 && !savedRef.current) {
        savedRef.current = true;
        const title = msgs.find(m => m.role === 'user')?.content.slice(0, 50)
          || `Chat ${new Date().toLocaleDateString('es-MX')}`;
        saveMutation.mutate({ data: { title, messages: msgs } });
      }
    };
  }, [cleanupAudio, saveMutation]);

  return {
    startRecording,
    stopRecording,
    sendTextMessage,
    interruptSpeech,
    resetConversation,
    saveConversation,
    exportConversation,
    isRecording,
    isProcessing,
    history,
    lastTranscript,
    lastError,
    tokensTotal,
    sessionStart,
    responseLength,
    setResponseLength,
    ttsSpeed,
    setTtsSpeed,
    analyser: analyserRef.current,
  };
}
