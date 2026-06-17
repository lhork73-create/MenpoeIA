import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUpdateSettings, useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const settingsSchema = z.object({
  avatarName: z.string().min(1, 'El nombre es obligatorio'),
  avatarPersonality: z.string().min(1, 'La personalidad es obligatoria'),
  avatarTone: z.string().min(1, 'El tono es obligatorio'),
  systemPrompt: z.string().min(1, 'El prompt del sistema es obligatorio'),
  voiceId: z.string().min(1, 'La voz es obligatoria'),
  voiceSpeed: z.number().min(0.5).max(2.0),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      avatarName: 'Mirror',
      avatarPersonality: 'Amigable y sabio',
      avatarTone: 'Cálido y claro',
      systemPrompt: 'Eres Mirror, un asistente de IA inteligente. Responde siempre en español, de manera amigable, clara y concisa. Mantén tus respuestas en 3 oraciones o menos salvo que se pida más detalle.',
      voiceId: 'es-MX-DaliaNeural',
      voiceSpeed: 1.0,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        avatarName: settings.avatarName,
        avatarPersonality: settings.avatarPersonality,
        avatarTone: settings.avatarTone,
        systemPrompt: settings.systemPrompt,
        voiceId: settings.voiceId,
        voiceSpeed: settings.voiceSpeed,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Configuración guardada', description: 'Los parámetros se actualizaron correctamente.' });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => {
        toast({ title: 'Error', description: 'No se pudieron actualizar los parámetros.', variant: 'destructive' });
      },
    });
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto glass-panel p-8 rounded-3xl mt-12 mb-12">
      <h2 className="text-2xl font-mono uppercase tracking-widest text-primary glow-text mb-8">Configuración</h2>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="avatarName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground font-mono uppercase text-xs">Nombre del Avatar</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50 border-white/10 focus-visible:border-primary" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="voiceId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground font-mono uppercase text-xs">Voz</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50 border-white/10">
                      <SelectValue placeholder="Selecciona una voz" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="es-MX-DaliaNeural">Dalia (Español MX, Femenina)</SelectItem>
                    <SelectItem value="es-ES-ElviraNeural">Elvira (Español ES, Femenina)</SelectItem>
                    <SelectItem value="es-MX-JorgeNeural">Jorge (Español MX, Masculina)</SelectItem>
                    <SelectItem value="es-ES-AlvaroNeural">Álvaro (Español ES, Masculina)</SelectItem>
                    <SelectItem value="es-AR-ElenaNeural">Elena (Español AR, Femenina)</SelectItem>
                    <SelectItem value="tara">Tara (Inglés, Femenina)</SelectItem>
                    <SelectItem value="leo">Leo (Inglés, Masculina)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="systemPrompt" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-mono uppercase text-xs">Prompt del sistema (instrucciones para la IA)</FormLabel>
              <FormControl>
                <Textarea {...field} className="h-36 bg-background/50 border-white/10 focus-visible:border-primary font-mono text-sm" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="avatarPersonality" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-mono uppercase text-xs">Personalidad</FormLabel>
              <FormControl>
                <Input {...field} className="bg-background/50 border-white/10 focus-visible:border-primary" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="voiceSpeed" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-mono uppercase text-xs flex justify-between">
                <span>Velocidad de voz</span>
                <span className="text-primary">{field.value.toFixed(1)}x</span>
              </FormLabel>
              <FormControl>
                <Slider min={0.5} max={2.0} step={0.1}
                  value={[field.value]} onValueChange={(vals) => field.onChange(vals[0])}
                  className="py-4" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <Button type="submit" disabled={updateSettings.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-black font-bold tracking-widest uppercase">
            {updateSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Guardar configuración
          </Button>
        </form>
      </Form>
    </div>
  );
}
