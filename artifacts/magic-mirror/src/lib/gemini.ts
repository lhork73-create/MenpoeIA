export const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
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
  const SPANISH_RULE =
    "\n\nREGLA ABSOLUTA IRROMPIBLE: Responde SIEMPRE y únicamente en español, sin excepción, de manera concisa (máximo 2-3 oraciones breves) salvo que el usuario pida más detalles.";
  const baseInstruction =
    (systemPrompt || "Eres Mirror, un asistente de IA inteligente, amigable y empático.") +
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

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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
        throw new Error(errData?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const candidateText =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (candidateText) {
        const tokens =
          data.usageMetadata?.totalTokenCount ||
          Math.round(candidateText.length / 4);
        return { text: candidateText, tokensUsed: tokens };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Model ${model} failed, trying next...`, err);
    }
  }

  throw lastError || new Error("No se pudo generar respuesta con Gemini.");
}
