const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

async function callGemini(
  message: string,
  history: { role: string; content: string }[],
  systemPrompt?: string
): Promise<{ text: string; tokensUsed: number }> {
  const SPANISH_RULE =
    '\n\nREGLA ABSOLUTA IRROMPIBLE: Responde SIEMPRE y unicamente en espanol, sin excepcion, de forma clara, amigable y concisa (maximo 2-3 oraciones breves) salvo que se pida mayor detalle.';
  const baseInstruction =
    (systemPrompt || 'Eres Mirror, un asistente de IA inteligente, amigable y empatico.') +
    SPANISH_RULE;

  const contents = [
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let lastErr: unknown = null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: baseInstruction }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error?.message || `HTTP ${res.status}`);
      }

      const data: any = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) {
        return {
          text: reply,
          tokensUsed: data.usageMetadata?.totalTokenCount || Math.round(reply.length / 4),
        };
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[Vercel Chat] Model ${model} failed:`, err);
    }
  }

  throw lastErr || new Error('No response from Gemini');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], systemPrompt } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Missing 'message' field" });
  }

  try {
    const result = await callGemini(message, history, systemPrompt);
    return res.json({ message: result.text, tokensUsed: result.tokensUsed });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return res.json({
      message: `Disculpa, hubo un inconveniente al conectar con Gemini: ${errMsg}.`,
      tokensUsed: 0,
    });
  }
}
