import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  active: boolean;
}

export function ThinkingIndicator({ active }: Props) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="thinking"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="flex flex-col items-center gap-2 pointer-events-none"
        >
          <div className="flex items-center gap-2">
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                style={{ boxShadow: '0 0 8px rgba(0,212,255,0.8)' }}
                animate={{ opacity: [0.25, 1, 0.25], y: [0, -6, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
              />
            ))}
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-primary/50">
            Procesando...
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
