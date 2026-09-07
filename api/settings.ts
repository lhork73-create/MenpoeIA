export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      aiName: 'Mirror',
      systemPrompt: 'Eres Mirror, un asistente de IA inteligente, amigable y empatico creado por MenpoeIA.',
      language: 'es',
      voice: 'es-419-Neural2-B',
      ttsEnabled: true,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
