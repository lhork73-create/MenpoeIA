export const GEMINI_API_KEY =
  (import.meta as any).env?.VITE_GEMINI_API_KEY ||
  (import.meta as any).env?.GEMINI_API_KEY ||
  "";

// Modelos verificados como activos (en orden de preferencia)
const GEMINI_CHAT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

const GEMINI_TRANSCRIBE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-transcribe",
  "gemini-3.6-flash",
];

export interface GeminiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function generateGeminiReply(
  userMessage: string,
  history: GeminiMessage[] = [],
  systemPrompt?: string
): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada. Verifica tu archivo .env");
  }

  const SPANISH_RULE =
    "\n\nREGLA ABSOLUTA IRROMPIBLE: Responde SIEMPRE y únicamente en español, sin excepción, de manera concisa y amigable (máximo 2-3 oraciones breves) salvo que el usuario pida más detalles.";
  const baseInstruction =
    (systemPrompt || "Eres Mirror, un asistente de IA inteligente, amigable y empático creado por MenpoeIA.") +
    SPANISH_RULE;

  // Build contents history
  const contents = [
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  let lastError: any = null;

  for (const model of GEMINI_CHAT_MODELS) {
    try {
      console.log(`[Gemini] Trying model: ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        systemInstruction: {
          parts: [{ text: baseInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${response.status}`;
        console.warn(`[Gemini] Model ${model} failed: ${errMsg}`);
        lastError = new Error(errMsg);
        continue;
      }

      const data = await response.json();
      const candidateText =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (candidateText) {
        const tokens =
          data.usageMetadata?.totalTokenCount ||
          Math.round(candidateText.length / 4);
        console.log(`[Gemini] Success with model: ${model}, tokens: ${tokens}`);
        return { text: candidateText, tokensUsed: tokens };
      }

      lastError = new Error(`Model ${model} returned empty response`);
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Model ${model} exception:`, err);
    }
  }

  throw lastError || new Error("No se pudo generar respuesta con Gemini.");
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string = "audio/webm"
): Promise<string> {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey || audioBase64.length < 100) return "";

  // Usar solo el tipo base, sin parámetros extra como ;codecs=opus
  const cleanMime = mimeType.split(";")[0].trim() || "audio/webm";

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64,
            },
          },
          {
            text: "Eres un transcriptor de voz a texto en español altamente preciso. Transcribe EXACTAMENTE lo que dice la persona en este audio en español. Devuelve ÚNICAMENTE el texto que escuchas, sin explicaciones ni comillas. Si el audio está en silencio o no se entiende, responde exactamente: [VACIO].",
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500,
    },
  };

  for (const model of GEMINI_TRANSCRIBE_MODELS) {
    try {
      console.log(`[GeminiTranscribe] Trying model: ${model}, mime: ${cleanMime}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[GeminiTranscribe] Model ${model} failed: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      console.log(`[GeminiTranscribe] Model ${model} result:`, rawText.slice(0, 80));
      if (rawText.toLowerCase().includes("[vacio]") || rawText.toLowerCase().includes("[silencio]")) {
        return "";
      }
      if (rawText) return rawText;
    } catch (err) {
      console.warn(`[GeminiTranscribe] Model ${model} exception:`, err);
    }
  }
  return "";
}
