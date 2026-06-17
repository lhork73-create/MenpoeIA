import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Zap, Clock } from 'lucide-react';

interface Props {
  messageCount: number;
  tokensTotal: number;
  sessionStart: number | null; // timestamp ms, null if no convo yet
}

function useTick(active: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function SessionStats({ messageCount, tokensTotal, sessionStart }: Props) {
  useTick(sessionStart !== null);

  if (messageCount === 0) return null;

  const elapsed = sessionStart ? Date.now() - sessionStart : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
    >
      <div className="flex items-center gap-4 px-4 py-2 rounded-full glass-panel border border-white/8 text-[11px] font-mono text-white/45">
        <span className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3 text-primary/60" />
          {messageCount}
        </span>
        <span className="w-px h-3 bg-white/10" />
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-secondary/60" />
          {tokensTotal.toLocaleString()} tk
        </span>
        <span className="w-px h-3 bg-white/10" />
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-white/30" />
          {formatDuration(elapsed)}
        </span>
      </div>
    </motion.div>
  );
}
