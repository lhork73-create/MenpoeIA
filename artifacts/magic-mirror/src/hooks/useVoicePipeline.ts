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

// Convert Blob → base64 string (strip data: prefix)
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Select the best available browser TTS voice (prefer natural/neural/online)
const getBestVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();
  const checks: ((v: SpeechSynthesisVoice) => boolean)[] = [
    (v) => /neural|natural/i.test(v.name) && v.lang.startsWith('en'),
    (v) => /online/i.test(v.name) && v.lang.startsWith('en'),
    (v) => !v.localService && v.lang.startsWith('en'),
    (v) => v.lang.startsWith('en-US'),
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

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);

  // Refs so effects never go stale
  const historyRef = useRef<ChatMessage[]>([]);
  historyRef.current = history;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const savedRef = useRef(false);

  // Call hook at top level, keep ref synced for use inside cleanup effect
  const save = useSaveConversation();
  const saveMutationRef = useRef(save);
  saveMutationRef.current = save;

  const { data: settings } = useGetSettings({ query: { queryKey: ['/api/settings'] } });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transcribeMutation = useTranscribeAudio();
  const chatMutation = useSendChat();

  // Cleanup on unmount — save once
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      const msgs = historyRef.current;
      if (msgs.length > 0 && !savedRef.current) {
        savedRef.current = true;
        saveMutationRef.current.mutate({
          data: { title: `Chat ${new Date().toLocaleDateString()}`, messages: msgs },
        });
      }
    };
  }, []); // intentionally empty — refs hold latest values

  // ─── TTS with browser SpeechSynthesis ─────────────────────────────────────
  const speak = useCallback((text: string, speed: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }

      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = Math.max(0.7, Math.min(1.6, speed));
      utter.pitch = 1.0;
      utter.volume = 1.0;

      // Wait for voices to load (needed in some browsers)
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

      // Animate mouth with smooth sinusoidal wave while TTS plays
      let t = 0;
      const animateMouth = () => {
        t += 0.12;
        // Natural speech rhythm: fast oscillation with occasional pauses
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

      utter.onend = finish;
      utter.onerror = finish;

      window.speechSynthesis.speak(utter);
    });
  }, [setStatus, setSpeakingVolume]);

  // ─── Process audio blob after user stops recording ─────────────────────────
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
        toast({ title: 'Nothing detected', description: 'Could not hear any speech. Try again.' });
        return;
      }

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

      setIsProcessing(false);

      await speak(chatRes.message, settingsRef.current?.voiceSpeed ?? 1.0);

    } catch (err) {
      console.error('Pipeline error:', err);
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
      setStatus('idle');
      setIsProcessing(false);
    }
  }, [transcribeMutation, chatMutation, speak, toast, setStatus]);

  // ─── Stop recording: halts mic, triggers processing ────────────────────────
  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    // Stop the analyser animation frame if running
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Stop the mic tracks
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }

    // Stop the recorder — onstop will fire handleAudioBlob
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    mediaRecorderRef.current = null;
    analyserRef.current = null;

    setIsRecording(false);
    // Status → thinking is set inside handleAudioBlob
  }, []);

  // ─── Start recording: opens mic, NO auto-stop ──────────────────────────────
  const startRecording = useCallback(async () => {
    // If AI is speaking, interrupt it
    window.speechSynthesis.cancel();
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setSpeakingVolume(0);

    // Close any existing audio context from TTS
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Build analyser for the waveform visualizer (NOT connected to mouth)
      const AudioCtx = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      // NOT connected to ctx.destination — we don't want mic playback
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
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
        title: 'Microphone Error',
        description: 'Could not access the microphone. Please allow access and try again.',
        variant: 'destructive',
      });
    }
  }, [handleAudioBlob, setStatus, setSpeakingVolume, toast]);

  // ─── Manual save ───────────────────────────────────────────────────────────
  const saveConversation = useCallback(() => {
    const msgs = historyRef.current;
    if (msgs.length > 0 && !savedRef.current) {
      savedRef.current = true;
      save.mutate({ data: { title: `Chat ${new Date().toLocaleDateString()}`, messages: msgs } });
    }
  }, [save]);

  return {
    startRecording,
    stopRecording,
    saveConversation,
    isRecording,
    isProcessing,
    history,
    analyser: analyserRef.current,
  };
}
