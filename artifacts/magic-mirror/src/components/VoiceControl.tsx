import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarStatus } from '../hooks/useAvatarState';

interface VoiceControlProps {
  status: AvatarStatus;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  analyser?: AnalyserNode | null;
}

export function VoiceControl({ status, isRecording, startRecording, stopRecording, analyser }: VoiceControlProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Waveform visualization
  useEffect(() => {
    if (!canvasRef.current || (!analyser && status !== 'listening' && status !== 'speaking')) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const draw = () => {
      if (!ctx || !canvas) return;
      
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // If we have real analyser data (during recording)
      if (analyser && isRecording) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const barWidth = (width / dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * height;
          ctx.fillStyle = `rgba(0, 240, 255, ${Math.max(0.2, barHeight / height)})`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      } 
      // Simulated waveform for speaking if no analyser hooked up directly for visualizer
      else if (status === 'speaking') {
        const numBars = 30;
        const barWidth = width / numBars - 2;
        let x = 0;
        
        for (let i = 0; i < numBars; i++) {
          const simulatedHeight = Math.random() * height * 0.8 + 10;
          ctx.fillStyle = `rgba(0, 240, 255, 0.6)`;
          ctx.fillRect(x, height / 2 - simulatedHeight / 2, barWidth, simulatedHeight);
          x += barWidth + 2;
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [analyser, isRecording, status]);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50 w-[90%] max-w-md">
      
      {/* Waveform Canvas */}
      <div className="w-full h-16 glass-panel rounded-full overflow-hidden flex items-center justify-center relative">
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={64} 
          className="w-full h-full opacity-70"
        />
        {(status === 'idle' || status === 'thinking') && (
          <div className="absolute inset-0 flex items-center justify-center text-primary/50 text-sm font-mono uppercase tracking-widest">
            {status === 'idle' ? 'Ready' : 'Processing Neural Links'}
          </div>
        )}
      </div>

      {/* Main Control Button */}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          size="lg"
          className={`rounded-full w-16 h-16 p-0 shadow-xl ${
            isRecording 
              ? 'bg-destructive hover:bg-destructive/90 text-white animate-pulse' 
              : status === 'thinking' || status === 'speaking'
                ? 'bg-secondary hover:bg-secondary/90 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={status === 'thinking' || status === 'speaking'}
          aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {status === 'thinking' ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </Button>
      </motion.div>
      
      {/* Status Badge */}
      <div className="px-4 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md text-xs font-mono uppercase tracking-widest text-primary glow-text">
        {status}
      </div>
    </div>
  );
}
