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
import { generateGeminiReply, transcribeAudioWithGemini } from '@/lib/gemini';
import { getSavedSettings } from '@/lib/settingsStorage';

export type ResponseLength = 'corta' | 'media' | 'larga';

const LENGTH_INSTRUCTION: Record<ResponseLength, string> = {
  corta: '\n\nIMPORTANTE: Sé MUY breve: máximo 1-2 oraciones cortas.',
  media: '',
  larga: '\n\nIMPORTANTE: Puedes dar una respuesta detallada y completa.',
};

// Formatos de audio soportados (prioridad en función de compatibilidad)
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

function getBestVoice(preferredVoice?: string): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  if (preferredVoice) {
    const pref = preferredVoice.toLowerCase();
    const match = voices.find(v => 
      v.name.toLowerCase().includes(pref) || 
      v.voiceURI.toLowerCase().includes(pref) ||
      (pref.includes('elvira') && v.name.toLowerCase().includes('elvira')) ||
      (pref.includes('dalia') && v.name.toLowerCase().includes('dalia')) ||
      (pref.includes('jorge') && v.name.toLowerCase().includes('jorge')) ||
      (pref.includes('alvaro') && v.name.toLowerCase().includes('alvaro')) ||
      (pref.includes('elena') && v.name.toLowerCase().includes('elena'))
    );
    if (match) return match;
  }

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
  const speechRecognitionRef    = useRef<any>(null);
  const speechRecognitionTextRef = useRef<string>('');
  const chunksRef = useRef<Blob[]>([]);

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

      const savedSettings = getSavedSettings();
      const currentRate = (settingsRef.current && typeof settingsRef.current === 'object' && 'voiceSpeed' in settingsRef.current && (settingsRef.current as any).voiceSpeed)
        ? (settingsRef.current as any).voiceSpeed
        : (savedSettings.voiceSpeed ?? ttsSpeedRef.current);

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate   = Math.max(0.7, Math.min(2.0, currentRate));
      utter.pitch  = 1.0;
      utter.volume = 1.0;
      utter.lang   = 'es-MX';

      const preferredVoice = (settingsRef.current && typeof settingsRef.current === 'object' && 'voiceId' in settingsRef.current && (settingsRef.current as any).voiceId)
        ? (settingsRef.current as any).voiceId
        : savedSettings.voiceId;

      const applyVoice = () => {
        const v = getBestVoice(preferredVoice);
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

  // ── Llamada a Gemini para chat ────────────────────────────────────────────
  const callGeminiChat = useCallback(async (
    userText: string,
    currentHistory: ChatMessage[],
    finalPrompt?: string
  ): Promise<{ text: string; tokensUsed: number }> => {
    try {
      return await generateGeminiReply(userText, currentHistory, finalPrompt);
    } catch (geminiErr) {
      console.warn('[VoicePipeline] Gemini client failed, trying backend...', geminiErr);
      const chatRes = await chatMutation.mutateAsync({
        data: { message: userText, history: currentHistory, systemPrompt: finalPrompt },
      });
      return { text: chatRes.message, tokensUsed: chatRes.tokensUsed ?? 0 };
    }
  }, [chatMutation]);

  // ── Procesar texto de usuario ─────────────────────────────────────────────
  const processUserText = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed) return;

    console.log('[VoicePipeline] Processing user text:', trimmed);

    setLastTranscript(trimmed);
    if (!sessionStart) setSessionStart(Date.now());

    const userMsg: ChatMessage = { role: 'user' as const, content: trimmed };
    const currentHistory = historyRef.current;
    const updatedHistory = [...currentHistory, userMsg];

    // Actualizar historial inmediatamente para que se vea en la UI
    setHistory(updatedHistory);
    historyRef.current = updatedHistory;

    const savedSettings = getSavedSettings();
    const basePrompt = (settingsRef.current && typeof settingsRef.current === 'object' && 'systemPrompt' in settingsRef.current && (settingsRef.current as any).systemPrompt)
      ? (settingsRef.current as any).systemPrompt
      : savedSettings.systemPrompt;
    const lengthExtra = LENGTH_INSTRUCTION[responseLenRef.current];
    const finalPrompt = basePrompt ? basePrompt + lengthExtra : undefined;

    try {
      const { text: replyMessage, tokensUsed: replyTokens } = await callGeminiChat(
        trimmed,
        currentHistory,
        finalPrompt
      );

      const aiMsg: ChatMessage = { role: 'assistant' as const, content: replyMessage };
      const finalHistory = [...updatedHistory, aiMsg];
      setHistory(finalHistory);
      historyRef.current = finalHistory;
      setTokensTotal(prev => prev + replyTokens);
      setIsProcessing(false);

      await speak(replyMessage);
    } catch (err) {
      throw err;
    }
  }, [sessionStart, callGeminiChat, speak]);

  // ── Procesar blob de audio ────────────────────────────────────────────────
  const handleAudioBlob = useCallback(async (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    setLastError(null);
    setStatus('thinking');

    console.log('[VoicePipeline] handleAudioBlob called, size:', blob.size, 'mime:', mimeType);

    try {
      const recDuration = Date.now() - recordingStartTimeRef.current;
      console.log('[VoicePipeline] Recording duration:', recDuration, 'ms');

      // Umbral reducido: 200 bytes y 300ms para no filtrar audio real corto
      if (blob.size < 200 || recDuration < 300) {
        setStatus('idle');
        setIsProcessing(false);
        toast({
          title: 'Audio muy corto',
          description: 'Pulsa el micrófono, habla y pulsa de nuevo para enviar.',
        });
        return;
      }

      // Esperar un poco a que SpeechRecognition procese sus resultados finales
      await new Promise(r => setTimeout(r, 400));

      // 1. Prioridad: Reconocimiento nativo continuo del navegador
      let userText = speechRecognitionTextRef.current.trim();
      console.log('[VoicePipeline] SpeechRecognition text:', userText || '(empty)');

      // 2. Si no hubo texto, transcribir con Gemini Multimodal
      if (!userText) {
        try {
          const base64 = await blobToBase64(blob);
          if (base64 && base64.length > 100) {
            const cleanMime = mimeType.split(';')[0] || 'audio/webm';
            console.log('[VoicePipeline] Trying Gemini audio transcription, mime:', cleanMime);
            userText = (await transcribeAudioWithGemini(base64, cleanMime)).trim();
            console.log('[VoicePipeline] Gemini transcription result:', userText || '(empty)');
          }
        } catch (geminiTransErr) {
          console.warn('[VoicePipeline] Gemini transcription failed:', geminiTransErr);
        }
      }

      // 3. Fallback al backend /api/transcribe
      if (!userText) {
        try {
          const base64 = await blobToBase64(blob);
          if (base64 && base64.length > 100) {
            console.log('[VoicePipeline] Trying backend transcription...');
            const transcribeRes = await transcribeMutation.mutateAsync({
              data: { audioBase64: base64, mimeType: mimeType || 'audio/webm' },
            });
            userText = transcribeRes.text?.trim() ?? '';
            console.log('[VoicePipeline] Backend transcription result:', userText || '(empty)');
          }
        } catch (backendErr) {
          console.warn('[VoicePipeline] Backend transcription failed:', backendErr);
        }
      }

      if (!userText) {
        setStatus('idle');
        setIsProcessing(false);
        toast({
          title: 'No se detectó voz',
          description: 'No se escuchó voz. Usa el teclado (ícono T) para escribir tu mensaje.',
        });
        return;
      }

      await processUserText(userText);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.';
      console.error('[VoicePipeline] handleAudioBlob error:', err);
      setLastError(msg);
      vibrateError();
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [transcribeMutation, processUserText, toast, setStatus]);

  // ── Detener grabación ────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    // Detener SpeechRecognition pero darle tiempo para enviar los resultados finales
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
      // No anulamos la ref inmediatamente — la callback onresult puede llegar aún
      setTimeout(() => { speechRecognitionRef.current = null; }, 600);
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) { setIsRecording(false); return; }

    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    if (recorder.state === 'recording') {
      // Solicitar datos finales antes de detener
      try { recorder.requestData(); } catch (_) {}
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
      const msg = 'Tu navegador no soporta grabación. Usa Chrome o Safari 14.3+.';
      setLastError(msg);
      toast({ title: 'Navegador no compatible', description: msg, variant: 'destructive' });
      return;
    }

    setStatus('listening');

    try {
      // Iniciar reconocimiento de voz nativo en tiempo real
      speechRecognitionTextRef.current = '';
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'es-419';
          recognition.maxAlternatives = 1;
          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript;
            }
            if (fullText.trim()) {
              speechRecognitionTextRef.current = fullText.trim();
              console.log('[SpeechRecognition] interim:', fullText.trim());
            }
          };
          recognition.onend = () => {
            // SpeechRecognition puede detenerse automáticamente en iOS — reiniciar si aún se graba
            if (isRecordingRef.current && speechRecognitionRef.current) {
              try { speechRecognitionRef.current.start(); } catch (_) {}
            }
          };
          recognition.onerror = (e: any) => {
            console.warn('[SpeechRecognition] error:', e.error);
          };
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (srErr) {
          console.warn('[SpeechRecognition] failed to start:', srErr);
        }
      } else {
        console.warn('[VoicePipeline] SpeechRecognition not available, will use Gemini transcription');
      }

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
        analyserRef.current = null;
      }

      const mimeType = getSupportedMimeType();
      const recOptions = mimeType ? { mimeType } : {};
      chunksRef.current = [];

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recOptions);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log('[MediaRecorder] chunk received, size:', e.data.size);
        }
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalMime });
        console.log('[MediaRecorder] stopped, total chunks:', chunks.length, 'blob size:', blob.size);
        handleAudioBlob(blob, finalMime);
      };

      recorder.onerror = (e) => {
        console.error('[MediaRecorder] error:', e);
        cleanupAudio();
        setIsRecording(false);
        setStatus('idle');
        mediaRecorderRef.current = null;
        toast({ title: 'Error de grabación', description: 'Intenta de nuevo.', variant: 'destructive' });
      };

      // timeslice 500ms para obtener chunks más fiables en móvil
      recordingStartTimeRef.current = Date.now();
      recorder.start(500);
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
        ? 'Permiso de micrófono denegado. Permite el acceso en tu navegador.'
        : 'No se pudo acceder al micrófono. Comprueba que no esté en uso.';
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

    console.log('[VoicePipeline] sendTextMessage:', trimmed);

    interruptSpeech();
    setIsProcessing(true);
    setLastError(null);
    setStatus('thinking');

    try {
      await processUserText(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.';
      console.error('[VoicePipeline] sendTextMessage error:', err);
      setLastError(msg);
      vibrateError();
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [processUserText, interruptSpeech, toast, setStatus]);

  // ── Resetear conversación ─────────────────────────────────────────────────
  const resetConversation = useCallback(() => {
    interruptSpeech();
    setHistory([]);
    historyRef.current = [];
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
