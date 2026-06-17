import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@workspace/api-client-react';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TranscriptPanelProps {
  messages: ChatMessage[];
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
}

export function TranscriptPanel({ messages, isOpen, onToggle, unreadCount = 0 }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  return (
    <>
      {/* Toggle Button + unread badge */}
      <div className="fixed top-6 right-6 z-50">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 relative"
          onClick={onToggle}
        >
          {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          <AnimatePresence>
            {!isOpen && unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-background
                           text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(0,240,255,0.8)]"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>

      {/* Slide-out Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full md:w-96 glass-panel border-l border-white/10 z-40 flex flex-col"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-mono tracking-widest text-primary glow-text uppercase">
                Neural Transcript
              </h2>
              <span className="text-xs font-mono text-muted-foreground">{messages.length} messages</span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground font-mono text-sm mt-10">
                  No communication established.
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">
                      {msg.role === 'user' ? 'You' : 'Mirror AI'}
                    </span>
                    <div
                      className={`p-3 rounded-2xl max-w-[85%] ${
                        msg.role === 'user'
                          ? 'bg-primary/20 text-primary-foreground rounded-tr-sm border border-primary/30'
                          : 'bg-secondary/20 text-secondary-foreground rounded-tl-sm border border-secondary/30'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
