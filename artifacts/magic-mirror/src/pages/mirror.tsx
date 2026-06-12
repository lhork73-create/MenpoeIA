import React, { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { VoiceControl } from '@/components/VoiceControl';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { useAvatarState } from '@/hooks/useAvatarState';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Settings, History } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MirrorPage() {
  const { status, setStatus, mouthOpenAmount, setSpeakingVolume } = useAvatarState();
  const { isRecording, startRecording, stopRecording, history, analyser } = useVoicePipeline(setStatus, setSpeakingVolume);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      
      {/* Top Navigation Overlay */}
      <div className="absolute top-6 left-6 z-50 flex gap-4">
        <Link href="/history">
          <Button variant="ghost" size="icon" className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20">
            <History className="w-5 h-5" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      {/* Main Avatar Canvas */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div 
          className="w-[120%] h-[120%] md:w-full md:h-full flex items-center justify-center pointer-events-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: "easeOut" }}
        >
          <Avatar status={status} mouthOpenAmount={mouthOpenAmount} />
        </motion.div>
      </div>

      {/* Voice Controls */}
      <VoiceControl 
        status={status}
        isRecording={isRecording}
        startRecording={startRecording}
        stopRecording={stopRecording}
        analyser={analyser}
      />

      {/* Transcript Panel */}
      <TranscriptPanel 
        messages={history}
        isOpen={isTranscriptOpen}
        onToggle={() => setIsTranscriptOpen(!isTranscriptOpen)}
      />
    </div>
  );
}
