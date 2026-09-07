export interface AppSettings {
  avatarName: string;
  avatarPersonality: string;
  avatarTone: string;
  systemPrompt: string;
  voiceId: string;
  voiceSpeed: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  avatarName: 'Mirror',
  avatarPersonality: 'Amigable y sabio',
  avatarTone: 'Cálido y claro',
  systemPrompt: 'Eres Mirror, un asistente de IA inteligente. Responde siempre en español, de manera amigable, clara y concisa. Mantén tus respuestas en 3 oraciones o menos salvo que se pida más detalle.',
  voiceId: 'es-MX-DaliaNeural',
  voiceSpeed: 1.0,
};

const STORAGE_KEY = 'menpoeia_settings_v1';

export function getSavedSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

export function saveSettingsLocally(settings: AppSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('menpoeia_settings_updated', { detail: settings }));
  } catch (_) {}
}
