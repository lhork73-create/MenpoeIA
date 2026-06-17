import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SHORTCUTS = [
  { key: 'Espacio',  desc: 'Iniciar / enviar grabación' },
  { key: 'H',       desc: 'Abrir / cerrar historial de chat' },
  { key: 'N',       desc: 'Nueva conversación' },
  { key: 'Esc',     desc: 'Interrumpir al AI mientras habla' },
  { key: 'M',       desc: 'Activar / desactivar modo manos libres' },
  { key: '?',       desc: 'Mostrar esta ayuda' },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  // Close on Escape handled by parent via prop pattern; register ? here
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '?') setOpen(v => !v);
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Floating help button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setOpen(v => !v)}
          className="rounded-full w-10 h-10 bg-background/20 backdrop-blur-md border border-white/10 text-white/50 hover:text-white hover:bg-white/10"
          title="Atajos de teclado (?)"
        >
          {open ? <X className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
        </Button>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="kbhelp"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-6 z-50 glass-panel rounded-2xl p-5 w-72 border border-white/10 shadow-2xl"
          >
            <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-4">Atajos de teclado</h3>
            <div className="space-y-3">
              {SHORTCUTS.map(({ key, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-[10px] font-mono text-primary whitespace-nowrap shrink-0">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
