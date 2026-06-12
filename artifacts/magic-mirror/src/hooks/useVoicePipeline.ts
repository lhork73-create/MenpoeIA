import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  useTranscribeAudio, 
  useSendChat, 
  useTextToSpeech,
  useGetSettings,
  useSaveConversation
} from '@workspace/api-client-react';
import { ChatMessage, ChatMessageRole, Settings } from '@workspace/api-client-react/src/generated/api.schemas';
import { useToast } from '@/hooks/use-toast';
import { AvatarStatus } from './useAvatarState';

// Base64 helper
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
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
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  
  // Refs for audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // APIs
  const { data: settings } = useGetSettings({ query: { queryKey: ['/api/settings'] } });
  const transcribeMutation = useTranscribeAudio();
  const chatMutation = useSendChat();
  const ttsMutation = useTextToSpeech();
  const saveMutation = useSaveConversation();

  // Handle auto-saving on unmount or manual trigger
  const handleSave = useCallback(() => {
    if (history.length > 0 && !conversationId) {
      saveMutation.mutate(
        { data: { title: `Chat ${new Date().toLocaleDateString()}`, messages: history } },
        {
          onSuccess: (data) => {
            setConversationId(data.id);
          }
        }
      );
    }
  }, [history, conversationId, saveMutation]);

  useEffect(() => {
    return () => {
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      handleSave();
    };
  }, [handleSave]);

  const processAIResponse = async (text: string) => {
    setStatus('thinking');
    try {
      const ttsRes = await ttsMutation.mutateAsync({
        data: {
          text,
          voice: settings?.voiceId || 'aura-asteria-en',
          speed: settings?.voiceSpeed || 1.0
        }
      });

      // Play audio and sync mouth
      const audioUrl = `data:audio/mp3;base64,${ttsRes.audioBase64}`;
      const audio = new Audio(audioUrl);
      playbackAudioRef.current = audio;

      // Setup analyser for mouth sync
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      playbackAnalyserRef.current = analyser;

      const source = ctx.createMediaElementSource(audio);
      playbackSourceRef.current = source;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      setStatus('speaking');
      audio.play();

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMouth = () => {
        if (audio.paused || audio.ended) {
          setSpeakingVolume(0);
          setStatus('idle');
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize roughly (0-255) to (0-1) with a boost
        setSpeakingVolume(Math.min(avg / 100, 1.0));
        animationFrameRef.current = requestAnimationFrame(updateMouth);
      };
      
      updateMouth();

      audio.onended = () => {
        setStatus('idle');
        setSpeakingVolume(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };

    } catch (err) {
      console.error(err);
      toast({ title: 'TTS Error', description: 'Failed to synthesize speech', variant: 'destructive' });
      setStatus('idle');
    }
  };

  const handleAudioData = async (blob: Blob) => {
    setStatus('thinking');
    try {
      const base64 = await blobToBase64(blob);
      const transcribeRes = await transcribeMutation.mutateAsync({
        data: { audioBase64: base64, mimeType: blob.type || 'audio/webm' }
      });

      if (!transcribeRes.text.trim()) {
        setStatus('idle');
        return;
      }

      const newUserMsg: ChatMessage = { role: 'user', content: transcribeRes.text };
      const newHistory = [...history, newUserMsg];
      setHistory(newHistory);

      const chatRes = await chatMutation.mutateAsync({
        data: {
          message: transcribeRes.text,
          history: history,
          systemPrompt: settings?.systemPrompt || 'You are an AI companion.'
        }
      });

      const newAIMsg: ChatMessage = { role: 'assistant', content: chatRes.message };
      setHistory([...newHistory, newAIMsg]);

      await processAIResponse(chatRes.message);

    } catch (err) {
      console.error(err);
      toast({ title: 'Processing Error', description: 'Failed to process voice input', variant: 'destructive' });
      setStatus('idle');
    }
  };

  const checkSilence = () => {
    if (!analyserRef.current || !isRecording) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;

    // Silence threshold
    if (avg < 15) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          stopRecording();
        }, 1500); // 1.5s of silence
      }
    } else {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }
    
    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(checkSilence);
    }
  };

  const startRecording = async () => {
    try {
      // Interrupt playback if needed
      if (playbackAudioRef.current && !playbackAudioRef.current.paused) {
        playbackAudioRef.current.pause();
        setStatus('idle');
        setSpeakingVolume(0);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();
      
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
      setIsRecording(true);
      setStatus('listening');
      
      // Start silence detection loop
      checkSilence();

    } catch (err) {
      console.error("Microphone access denied:", err);
      toast({ title: 'Microphone Error', description: 'Could not access microphone', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsRecording(false);
  };

  return {
    startRecording,
    stopRecording,
    isRecording,
    history,
    analyser: analyserRef.current, // Expose for visualizer if needed
  };
}
