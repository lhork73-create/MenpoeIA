import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@workspace/api-client-react';
import { MessageSquare, X, Copy, Check, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TranscriptPanelProps {
  messages: ChatMessage[];
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
  onSendMessage?: (text: string) => void;
  isProcessing?: boolean;
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

export function TranscriptPanel({
  messages,
  isOpen,
  onToggle,
  unreadCount = 0,
  onSendMessage,
  isProcessing = false,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const copyAll = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'Tú' : 'Mirror AI'}: ${m.content}`).join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isProcessing) return;
    onSendMessage?.(trimmed);
    setInputText('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="fixed inset-y-0 right-0 w-full sm:w-96 glass-panel border-l border-white/10 z-50 flex flex-col bg-background/95 backdrop-blur-2xl shadow-2xl"
        >
          {/* Cabecera del panel */}
          <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-base font-mono tracking-widest text-primary glow-text uppercase">Transcripción</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {messages.length} mensaje{messages.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={copyAll}
                  className="text-[11px] font-mono text-primary/70 hover:text-primary border border-white/10 hover:border-primary/40 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1.5"
                  title="Copiar toda la conversación"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              )}
              {/* Botón de cerrar integrado en la cabecera */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="rounded-full w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"
                title="Cerrar panel"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Lista de mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scroll-smooth">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground font-mono text-sm mt-12">
                <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30 text-primary" />
                Sin conversación todavía.
                <p className="text-xs text-white/40 mt-1">Escribe abajo o usa el micrófono para comenzar.</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col group ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role !== 'user' && <CopyButton text={msg.content} />}
                    <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
                      {msg.role === 'user' ? 'Tú' : 'Mirror AI'}
                    </span>
                    {msg.role === 'user' && <CopyButton text={msg.content} />}
                  </div>
                  <div
                    className={`p-3 rounded-2xl max-w-[88%] text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary/20 text-white rounded-tr-sm border border-primary/30'
                        : 'bg-white/5 text-white/90 rounded-tl-sm border border-white/10'
                    }`}
                  >
                    <p>{msg.content}</p>
                  </div>
                </motion.div>
              ))
            )}
            {isProcessing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-primary/70 text-xs font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mirror está respondiendo...
              </motion.div>
            )}
          </div>

          {/* Entrada de texto integrada en el pie del panel */}
          <div className="p-3 sm:p-4 border-t border-white/10 bg-black/40">
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Escribe tu mensaje..."
                disabled={isProcessing}
                className="flex-1 bg-white/5 border border-white/15 rounded-full px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/60 transition-colors"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputText.trim() || isProcessing}
                className="rounded-full w-9 h-9 sm:w-10 sm:h-10 bg-primary text-black hover:bg-primary/90 flex-shrink-0 disabled:opacity-40"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
