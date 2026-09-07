const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

async function handleChat(body) {
  const { message, history = [], systemPrompt } = body;
  const SPANISH_RULE = '\n\nREGLA ABSOLUTA IRROMPIBLE: Responde SIEMPRE y unicamente en espanol, sin excepcion, de forma clara, amigable y concisa (maximo 2-3 oraciones breves) salvo que se pida mayor detalle.';
  const baseInstruction = (systemPrompt || 'Eres Mirror, un asistente de IA inteligente, amigable y empatico.') + SPANISH_RULE;
  const contents = [
    ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let lastErr = null;
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
        throw new Error(e?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) {
        return { text: reply, tokensUsed: data.usageMetadata?.totalTokenCount || Math.round(reply.length / 4) };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No response from Gemini');
}

async function handleTranscribe(body) {
  const { audioBase64, mimeType = 'audio/webm' } = body;
  if (!audioBase64 || audioBase64.length < 100) return { text: '' };
  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const reqBody = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: cleanMime, data: audioBase64 } },
        { text: 'Eres un transcriptor de voz a texto en espanol altamente preciso. Transcribe EXACTAMENTE lo que dice la persona en este audio. Devuelve UNICAMENTE el texto que escuchas, sin comillas, sin introducciones ni explicaciones. Si el audio esta completamente en silencio o solo contiene ruido ininteligible, responde exactamente: [VACIO]' },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
  });

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody });
      if (!res.ok) continue;
      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (rawText.includes('[VACIO]') || rawText.includes('[SILENCIO]')) return { text: '' };
      return { text: rawText };
    } catch (_) {}
  }
  return { text: '' };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API endpoints
  if (pathname === '/api/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      aiName: 'Mirror',
      systemPrompt: 'Eres Mirror, un asistente de IA inteligente, amigable y empatico creado por MenpoeIA.',
      language: 'es',
      voice: 'es-419-Neural2-B',
      ttsEnabled: true,
    }));
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const result = await handleChat(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: result.text, tokensUsed: result.tokensUsed }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: `Disculpa, ocurrio un error: ${err.message}`, tokensUsed: 0 }));
    }
  }

  if (pathname === '/api/transcribe' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const result = await handleTranscribe(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // SPA fallback to index.html
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;
