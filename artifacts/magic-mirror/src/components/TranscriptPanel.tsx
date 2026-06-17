import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@workspace/api-client-react';
import { MessageSquare, X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TranscriptPanelProps {
  messages: ChatMessage[];
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  return (
    <button onClick={copy}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white"
      title="Copiar mensaje">
      <AnimatePresence mode="wait">
        {copied
          ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="w-3 h-3 text-green-400" /></motion.div>
          : <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }}><Copy className="w-3 h-3" /></motion.div>
        }
      </AnimatePresence>
    </button>
  );
}

export function TranscriptPanel({ messages, isOpen, onToggle, unreadCount = 0 }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen]);

  const copyAll = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'Tú' : 'Mirror AI'}: ${m.content}`).join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <>
      {/* Botón de apertura + badge */}
      <div className="fixed top-6 right-6 z-50">
        <Button variant="ghost" size="icon"
          className="rounded-full bg-background/20 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 relative"
          onClick={onToggle}>
          {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          <AnimatePresence>
            {!isOpen && unreadCount > 0 && (
              <motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-background
                           text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(0,240,255,0.8)]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>

      {/* Panel deslizable */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full md:w-96 glass-panel border-l border-white/10 z-40 flex flex-col"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-base font-mono tracking-widest text-primary glow-text uppercase">Transcripción</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</p>
              </div>
              {messages.length > 0 && (
                <button onClick={copyAll}
                  className="text-[11px] font-mono text-primary/60 hover:text-primary border border-white/10 hover:border-primary/40
                             px-3 py-1 rounded-full transition-colors flex items-center gap-1.5"
                  title="Copiar toda la conversación">
                  <Copy className="w-3 h-3" /> Copiar todo
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 scroll-smooth">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground font-mono text-sm mt-12">
                  <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  Sin conversación todavía.
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col group ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {msg.role !== 'user' && <CopyButton text={msg.content} />}
                      <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
                        {msg.role === 'user' ? 'Tú' : 'Mirror AI'}
                      </span>
                      {msg.role === 'user' && <CopyButton text={msg.content} />}
                    </div>
                    <div className={`p-3 rounded-2xl max-w-[88%] ${
                      msg.role === 'user'
                        ? 'bg-primary/20 text-primary-foreground rounded-tr-sm border border-primary/30'
                        : 'bg-secondary/20 text-secondary-foreground rounded-tl-sm border border-secondary/30'
                    }`}>
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
