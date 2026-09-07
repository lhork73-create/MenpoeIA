const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const content = fs.readFileSync(file, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
    }
  });
  return env;
}

const env = loadEnv('.env');
const key = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;

async function testSuite() {
  console.log('========================================================');
  console.log('   PRUEBAS INTERNAS: MAGIC MIRROR AI + MOBILE + IA     ');
  console.log('========================================================\n');

  console.log('--- TEST 1: VERIFICAR ARQUITECTURA MOBILE SIN SCROLL ---');
  const html = fs.readFileSync('public/index.html', 'utf8');
  const hasViewport = html.includes('user-scalable=no') && html.includes('viewport-fit=cover');
  console.log('1.1 Meta Viewport (no-scale, viewport-fit=cover):', hasViewport ? '✅ PASS' : '❌ FAIL');

  const cssFiles = fs.readdirSync('public/assets').filter(f => f.endsWith('.css'));
  if (cssFiles.length > 0) {
    const css = fs.readFileSync('public/assets/' + cssFiles[0], 'utf8');
    const has100dvh = css.includes('100dvh');
    const hasFixed = css.includes('position:fixed') || css.includes('overflow:hidden');
    console.log('1.2 CSS 100dvh & bloqueo fijo anti-scroll:', (has100dvh && hasFixed) ? '✅ PASS' : '❌ FAIL');
  }

  console.log('\n--- TEST 2: PREGUNTAS A LA IA (PROMPT & ESPAÑOL & VELOCIDAD) ---');
  const questions = [
    'Hola Mirror, presentate y dime qué puedes hacer por mí.',
    '¿Qué recomendaciones tienes para una rutina de mañana saludable?',
    'Dame una frase inspiradora para hoy.'
  ];

  const models = ['gemini-3.5-flash', 'gemini-3.6-flash'];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\nPregunta ${i + 1}: "${q}"`);
    let answered = false;
    for (const model of models) {
      try {
        const start = Date.now();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: 'Eres Mirror, un asistente de IA inteligente, amigable y empatico de MenpoeIA. REGLA ABSOLUTA: Responde SIEMPRE en espanol de forma concisa y elegante (maximo 2-3 oraciones breves).' }] },
            contents: [{ role: 'user', parts: [{ text: q }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
          })
        });
        const data = await res.json();
        if (res.ok) {
          const ans = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          const ms = Date.now() - start;
          console.log(`  Respuesta IA [${model}] (${ms}ms):`);
          console.log(`  "${ans}"`);
          answered = true;
          break;
        }
      } catch (err) {
        // try next model
      }
    }
    if (!answered) {
      console.log(`  ❌ Error al obtener respuesta para la pregunta ${i + 1}`);
    }
  }

  console.log('\n--- TEST 3: VERIFICAR SERVIDOR Y APIS LOCALES Y REMOTAS ---');
  console.log('3.1 Comprobando URL de producción en Vercel...');
  try {
    const vRes = await fetch('https://menpoe-ia-api-server.vercel.app');
    console.log('    Producción Vercel HTTP Status:', vRes.status, vRes.status === 200 ? '✅ EN LÍNEA' : '⚠');
  } catch (err) {
    console.log('    Error conectando a Vercel:', err.message);
  }

  console.log('\n========================================================');
  console.log('               TODAS LAS PRUEBAS COMPLETADAS            ');
  console.log('========================================================');
}

testSuite().catch(console.error);
