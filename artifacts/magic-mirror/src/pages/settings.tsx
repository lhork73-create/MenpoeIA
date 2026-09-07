import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from '@/components/SettingsPanel';

export default function SettingsPage() {
  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-background text-foreground p-4 sm:p-6 md:p-12 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y z-50">
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-secondary/20 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-primary/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto pb-28 sm:pb-32">
        <div className="flex items-center gap-4 sm:gap-6 mb-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full bg-white/5 hover:bg-white/10 border border-white/10 w-10 h-10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-mono uppercase tracking-widest text-secondary glow-violet">Configuración</h1>
        </div>

        <SettingsPanel />
      </div>
    </div>
  );
}
