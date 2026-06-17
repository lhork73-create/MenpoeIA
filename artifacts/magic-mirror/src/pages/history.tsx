import React, { useState } from 'react';
import { useListConversations, useDeleteConversation, getListConversationsQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Trash2, Loader2, MessageSquare, Search } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function HistoryPage() {
  const { data: conversations, isLoading } = useListConversations({ query: { queryKey: getListConversationsQueryKey() } });
  const deleteMutation = useDeleteConversation();
  const queryClient   = useQueryClient();
  const { toast }     = useToast();
  const [search, setSearch] = useState('');

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        toast({ title: 'Conversación eliminada', description: 'El registro fue borrado correctamente.' });
      },
    });
  };

  const filtered = (conversations ?? []).filter(conv => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      conv.title.toLowerCase().includes(q) ||
      conv.messages.some(m => m.content.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative overflow-x-hidden">
      {/* Fondo decorativo */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-primary/20 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-secondary/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Encabezado */}
        <div className="flex items-center gap-6 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full bg-white/5 hover:bg-white/10 border border-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-mono uppercase tracking-widest text-primary glow-text">Historial</h1>
            {conversations && (
              <p className="text-xs font-mono text-muted-foreground mt-1 uppercase tracking-wider">
                {conversations.length} conversación{conversations.length !== 1 ? 'es' : ''} guardada{conversations.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Buscador */}
        {!isLoading && conversations && conversations.length > 0 && (
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar en conversaciones..."
              className="pl-11 bg-white/5 border-white/10 focus-visible:border-primary font-mono"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="text-center py-20 glass-panel rounded-3xl border border-white/5">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-mono text-muted-foreground uppercase tracking-wider">Sin conversaciones</h3>
            <p className="text-sm text-muted-foreground/60 mt-2">Habla con Mirror para guardar conversaciones aquí.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 glass-panel rounded-3xl border border-white/5">
            <p className="text-muted-foreground font-mono text-sm">Sin resultados para "{search}"</p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {filtered.map((conv) => (
                <motion.div key={conv.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-panel p-6 rounded-2xl relative group">

                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{conv.title}</h3>
                      <p className="text-xs font-mono text-primary/60 uppercase tracking-wider mt-1">
                        {format(new Date(conv.createdAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground/50 mt-0.5">
                        {conv.messages.length} mensaje{conv.messages.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(conv.id)}
                      disabled={deleteMutation.isPending}
                      title="Eliminar conversación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    {conv.messages.slice(0, 3).map((msg, idx) => (
                      <div key={idx} className="flex flex-col">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">
                          {msg.role === 'user' ? 'Tú' : 'Mirror AI'}
                        </span>
                        <p className={`text-sm line-clamp-2 ${msg.role === 'user' ? 'text-white/80' : 'text-primary/80'}`}>
                          {msg.content}
                        </p>
                      </div>
                    ))}
                    {conv.messages.length > 3 && (
                      <p className="text-xs text-muted-foreground italic mt-2">
                        +{conv.messages.length - 3} mensaje{conv.messages.length - 3 !== 1 ? 's' : ''} más...
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
