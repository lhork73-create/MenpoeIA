import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useTranscribeAudio,
  useSendChat,
  useGetSettings,
  useSaveConversation,
} from '@workspace/api-client-react';
import { ChatMessage } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { AvatarStatus } from './useAvatarState';

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && !!window.speechSynthesis;
const safeCancel = () => { if (hasSpeech()) window.speechSynthesis.cancel(); };

// Voces: español primero, luego inglés
const getBestVoice = (): SpeechSynthesisVoice | null => {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  const checks: ((v: SpeechSynthesisVoice) => boolean)[] = [
    (v) => /neural|natural/i.test(v.name) && v.lang.startsWith('es'),
    (v) => /online/i.test(v.name) && v.lang.startsWith('es'),
    (v) => !v.localService && v.lang.startsWith('es'),
    (v) => v.lang.startsWith('es-MX'),
    (v) => v.lang.startsWith('es'),
    (v) => /neural|natural/i.test(v.name) && v.lang.startsWith('en'),
    (v) => !v.localService && v.lang.startsWith('en'),
    (v) => v.lang.startsWith('en'),
  ];
  for (const check of checks) {
    const found = voices.find(check);
    if (found) return found;
  }
  return voices[0] ?? null;
};

export function useVoicePipeline(
  setStatus: (s: AvatarStatus) => void,
  setSpeakingVolume: (v: number) => void,
) {
  const { toast } = useToast();

  const [isRecording,   setIsRecording]   = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [history,       setHistory]       = useState<ChatMessage[]>([]);
  const [lastTranscript, setLastTranscript] = useState('');
  const [tokensTotal,   setTokensTotal]   = useState(0);
  const [sessionStart,  setSessionStart]  = useState<number | null>(null);

  const historyRef = useRef<ChatMessage[]>([]);
  historyRef.current = history;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef   = useRef<MediaStream | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const animFrameRef     = useRef<number | null>(null);
  const speechRef        = useRef<SpeechSynthesisUtterance | null>(null);
  const savedRef         = useRef(false);

  const save = useSaveConversation();
  const saveMutationRef  = useRef(save);
  saveMutationRef.current = save;

  const { data: settings } = useGetSettings({ query: { queryKey: ['/api/settings'] } });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transcribeMutation = useTranscribeAudio();
  const chatMutation       = useSendChat();

  // Cleanup on unmount — save once
  useEffect(() => {
    return () => {
      safeCancel();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      const msgs = historyRef.current;
      if (msgs.length > 0 && !savedRef.current) {
        savedRef.current = true;
        saveMutationRef.current.mutate({
          data: { title: `Chat ${new Date().toLocaleDateString('es-MX')}`, messages: msgs },
        });
      }
    };
  }, []);

  // ─── TTS ──────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string, speed: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!hasSpeech()) { resolve(); return; }
      safeCancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate  = Math.max(0.7, Math.min(1.6, speed));
      utter.pitch = 1.0;
      utter.volume = 1.0;

      const applyVoice = () => {
        const voice = getBestVoice();
        if (voice) utter.voice = voice;
      };
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => { applyVoice(); };
      } else {
        applyVoice();
      }

      speechRef.current = utter;
      setStatus('speaking');

      let t = 0;
      const animateMouth = () => {
        t += 0.12;
        const wave = Math.max(0, Math.sin(t) * 0.7 + Math.sin(t * 1.7) * 0.3);
        setSpeakingVolume(wave);
        animFrameRef.current = requestAnimationFrame(animateMouth);
      };

      utter.onstart = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animateMouth();
      };

      const finish = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
        setSpeakingVolume(0);
        setStatus('idle');
        resolve();
      };

      utter.onend   = finish;
      utter.onerror = finish;

      if (hasSpeech()) window.speechSynthesis.speak(utter);
      else finish();
    });
  }, [setStatus, setSpeakingVolume]);

  // ─── Process audio blob ─────────────────────────────────────────────────
  const handleAudioBlob = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    setStatus('thinking');

    try {
      const base64 = await blobToBase64(blob);
      const transcribeRes = await transcribeMutation.mutateAsync({
        data: { audioBase64: base64, mimeType: blob.type || 'audio/webm' },
      });

      const userText = transcribeRes.text.trim();
      if (!userText) {
        setStatus('idle');
        setIsProcessing(false);
        toast({ title: 'Sin audio detectado', description: 'No se escuchó voz. Intenta de nuevo.' });
        return;
      }
      setLastTranscript(userText);

      // Mark session start on first message
      setSessionStart(prev => prev ?? Date.now());

      const userMsg: ChatMessage = { role: 'user' as const, content: userText };
      const updatedHistory = [...historyRef.current, userMsg];
      setHistory(updatedHistory);

      const chatRes = await chatMutation.mutateAsync({
        data: {
          message: userText,
          history: historyRef.current,
          systemPrompt: settingsRef.current?.systemPrompt ?? undefined,
        },
      });

      const aiMsg: ChatMessage = { role: 'assistant' as const, content: chatRes.message };
      setHistory([...updatedHistory, aiMsg]);
      setTokensTotal(prev => prev + (chatRes.tokensUsed ?? 0));
      setIsProcessing(false);

      await speak(chatRes.message, settingsRef.current?.voiceSpeed ?? 1.0);

    } catch (err) {
      console.error('Pipeline error:', err);
      toast({ title: 'Error', description: 'Algo salió mal. Intenta de nuevo.', variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [transcribeMutation, chatMutation, speak, toast, setStatus]);

  // ─── Stop recording ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    analyserRef.current = null;
    setIsRecording(false);
  }, []);

  // ─── Start recording ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    safeCancel();
    setStatus('listening');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Analyser for waveform visualisation
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        handleAudioBlob(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatus('listening');

    } catch (err) {
      console.error('Mic error:', err);
      toast({
        title: 'Error de micrófono',
        description: 'No se pudo acceder al micrófono. Permite el acceso e intenta de nuevo.',
        variant: 'destructive',
      });
    }
  }, [handleAudioBlob, setStatus, setSpeakingVolume, toast]);

  // ─── Interrupt AI speech ─────────────────────────────────────────────────
  const interruptSpeech = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setSpeakingVolume(0);
    safeCancel();
    setStatus('idle');
  }, [setStatus, setSpeakingVolume]);

  // ─── Reset conversation ──────────────────────────────────────────────────
  const resetConversation = useCallback(() => {
    interruptSpeech();
    setHistory([]);
    setLastTranscript('');
    setTokensTotal(0);
    setSessionStart(null);
    savedRef.current = false;
  }, [interruptSpeech]);

  // ─── Manual save ─────────────────────────────────────────────────────────
  const saveConversation = useCallback(() => {
    const msgs = historyRef.current;
    if (msgs.length > 0) {
      savedRef.current = true;
      const title = msgs[0]?.content?.slice(0, 40) || `Chat ${new Date().toLocaleDateString('es-MX')}`;
      save.mutate({ data: { title, messages: msgs } });
      toast({ title: 'Conversación guardada', description: 'Registrada en el historial.' });
    } else {
      toast({ title: 'Sin mensajes', description: 'Habla primero para guardar algo.', variant: 'destructive' });
    }
  }, [save, toast]);

  return {
    startRecording,
    stopRecording,
    interruptSpeech,
    resetConversation,
    saveConversation,
    isRecording,
    isProcessing,
    history,
    lastTranscript,
    tokensTotal,
    sessionStart,
    analyser: analyserRef.current,
  };
}
