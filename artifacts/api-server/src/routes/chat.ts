import { Router, type IRouter } from "express";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
const GEMINI_MODELS = [
  "gemini-3.6-flash",         // Verified fast & active
  "gemini-3.5-flash",         // Verified fast & active
  "gemini-3.8-flash",         // High quality
  "gemini-flash-latest",      // Fallback
  "gemini-flash-lite-latest", // Lite fallback
];

async function callGoogleGemini(
  message: string,
  history: { role: string; content: string }[],
  systemPrompt?: string
): Promise<{ text: string; tokensUsed: number }> {
  const SPANISH_RULE =
    "\n\nREGLA ABSOLUTA IRROMPIBLE: Responde SIEMPRE y únicamente en español, sin excepción, de forma clara, amigable y concisa (máximo 2-3 oraciones breves) salvo que se pida mayor detalle.";
  const baseInstruction =
    (systemPrompt || "Eres Mirror, un asistente de IA inteligente, amigable y empático.") +
    SPANISH_RULE;

  const contents = [
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  let lastErr: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: baseInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
          },
        }),
      });

      if (!res.ok) {
        const errData: any = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }

      const data: any = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) {
        const tokens = data.usageMetadata?.totalTokenCount || Math.round(reply.length / 4);
        return { text: reply, tokensUsed: tokens };
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[API Server] Gemini model ${model} error:`, err);
    }
  }

  throw lastErr || new Error("No response from Google Gemini");
}

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, history, systemPrompt } = parsed.data;

  try {
    const result = await callGoogleGemini(message, history, systemPrompt ?? undefined);
    res.json(SendChatResponse.parse({ message: result.text, tokensUsed: result.tokensUsed }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    req.log?.error?.({ err }, "Google Gemini completion error");
    const fallback = `Disculpa, hubo un inconveniente al conectar con Google Gemini: ${errMsg}.`;
    res.json(SendChatResponse.parse({ message: fallback, tokensUsed: 0 }));
  }
});

export default router;
