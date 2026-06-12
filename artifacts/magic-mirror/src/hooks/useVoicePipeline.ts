import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useTranscribeAudio,
  useSendChat,
  useGetSettings,
  useSaveConversation
} from '@workspace/api-client-react';
import { ChatMessage } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { AvatarStatus } from './useAvatarState';

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export function useVoicePipeline(
  setStatus: (status: AvatarStatus) => void,
  setSpeakingVolume: (vol: number) => void
) {
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [conversationSaved, setConversationSaved] = useState(false);

  // Use refs so cleanup effect never needs to change
  const historyRef = useRef<ChatMessage[]>([]);
  const conversationSavedRef = useRef(false);

  // Keep refs in sync with state
  historyRef.current = history;
  conversationSavedRef.current = conversationSaved;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);

  const { data: settings } = useGetSettings({ query: { queryKey: ['/api/settings'] } });
  const transcribeMutation = useTranscribeAudio();
  const chatMutation = useSendChat();
  const saveMutation = useSaveConversation();

  // Keep mutation ref stable to avoid stale closures in cleanup
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Cleanup effect runs only on unmount — refs hold latest values
  useEffect(() => {
    return () => {
      if (playbackAudioRef.current) playbackAudioRef.current.pause();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      // Save on unmount only once
      const msgs = historyRef.current;
      if (msgs.length > 0 && !conversationSavedRef.current) {
        conversationSavedRef.current = true;
        saveMutationRef.current.mutate({
          data: { title: `Chat ${new Date().toLocaleDateString()}`, messages: msgs }
        });
      }
    };
  }, []); // Empty deps — intentional, uses refs

  const saveConversation = useCallback(() => {
    const msgs = historyRef.current;
    if (msgs.length > 0 && !conversationSavedRef.current) {
      conversationSavedRef.current = true;
      setConversationSaved(true);
      saveMutation.mutate({
        data: { title: `Chat ${new Date().toLocaleDateString()}`, messages: msgs }
      });
    }
  }, [saveMutation]);

  // Browser-native TTS using Web Speech API — no API key required
  const playTTS = (text: string, speed: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        setStatus('idle');
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));
      utterance.pitch = 0.9;
      utterance.volume = 1.0;

      // Prefer an English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith('en') && !v.localService)
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
      if (preferred) utterance.voice = preferred;

      setStatus('speaking');

      // Simulate mouth movement with oscillating volume since SpeechSynthesis
      // doesn't expose audio data — animate at ~10fps during speech
      let mouthAngle = 0;
      const mouthInterval = window.setInterval(() => {
        mouthAngle += 0.4;
        setSpeakingVolume(0.4 + Math.abs(Math.sin(mouthAngle)) * 0.6);
      }, 80);

      utterance.onend = () => {
        clearInterval(mouthInterval);
        setSpeakingVolume(0);
        setStatus('idle');
        resolve();
      };

      utterance.onerror = () => {
        clearInterval(mouthInterval);
        setSpeakingVolume(0);
        setStatus('idle');
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const handleAudioData = async (blob: Blob) => {
    setStatus('thinking');
    try {
      const base64 = await blobToBase64(blob);
      const transcribeRes = await transcribeMutation.mutateAsync({
        data: { audioBase64: base64, mimeType: blob.type || 'audio/webm' }
      });

      const userText = transcribeRes.text.trim();
      if (!userText) {
        setStatus('idle');
        return;
      }

      const newUserMsg: ChatMessage = { role: 'user' as const, content: userText };
      const updatedHistory = [...historyRef.current, newUserMsg];
      setHistory(updatedHistory);

      const chatRes = await chatMutation.mutateAsync({
        data: {
          message: userText,
          history: historyRef.current,
          systemPrompt: settings?.systemPrompt ?? 'You are Mirror, an intelligent AI assistant. Be concise and friendly.'
        }
      });

      const aiMsg: ChatMessage = { role: 'assistant' as const, content: chatRes.message };
      const finalHistory = [...updatedHistory, aiMsg];
      setHistory(finalHistory);

      const speed = settings?.voiceSpeed ?? 1.0;
      await playTTS(chatRes.message, speed);

    } catch (err) {
      console.error('Pipeline error:', err);
      toast({ title: 'Error', description: 'Failed to process voice input', variant: 'destructive' });
      setStatus('idle');
    }
  };

  const checkSilence = useCallback(() => {
    if (!analyserRef.current || !isRecordingRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

    if (avg < 15) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          stopRecording();
        }, 1500);
      }
    } else {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }

    if (isRecordingRef.current) {
      animationFrameRef.current = requestAnimationFrame(checkSilence);
    }
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (playbackAudioRef.current && !playbackAudioRef.current.paused) {
        playbackAudioRef.current.pause();
        setSpeakingVolume(0);
        setStatus('idle');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        handleAudioData(blob);
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus('listening');
      checkSilence();

    } catch (err) {
      console.error('Microphone error:', err);
      toast({ title: 'Microphone Error', description: 'Could not access microphone', variant: 'destructive' });
    }
  }, [checkSilence, setStatus, setSpeakingVolume]);

  return {
    startRecording,
    stopRecording,
    saveConversation,
    isRecording,
    history,
    analyser: analyserRef.current,
  };
}
