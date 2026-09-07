import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function transcribeWithGemini(audioBase64: string, mimeType: string): Promise<string> {
  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: cleanMime, data: audioBase64 } },
      { text: 'Eres un transcriptor de voz a texto en espanol altamente preciso. Transcribe EXACTAMENTE lo que dice la persona en este audio. Devuelve UNICAMENTE el texto que escuchas, sin comillas, sin introducciones ni explicaciones. Si el audio esta completamente en silencio o solo contiene ruido ininteligible, responde exactamente: [VACIO]' },
    ]}],
    generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
  });
  let lastErr: unknown = null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = https://generativelanguage.googleapis.com/v1beta/models/:generateContent?key=;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) { continue; }
      const json: any = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (rawText.includes('[VACIO]') || rawText.includes('[SILENCIO]')) return '';
      return rawText;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('Could not transcribe');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { audioBase64, mimeType = 'audio/webm' } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length < 100) {
    return res.json({ text: '' });
  }
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (audioBuffer.length < 500) return res.json({ text: '' });
  try {
    const text = await transcribeWithGemini(audioBase64, mimeType);
    return res.json({ text: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: Error de transcripcion:  });
  }
}
