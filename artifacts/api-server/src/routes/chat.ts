import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, history, systemPrompt } = parsed.data;

  const systemMessage = systemPrompt ??
    "Eres Mirror, un asistente de IA inteligente. Responde siempre en español, de manera amigable, clara y concisa. Mantén tus respuestas en 3 oraciones o menos salvo que se pida más detalle.";

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage },
    ...history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    { role: "user", content: message },
  ];

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: 512,
    temperature: 0.7,
  });

  const responseText = completion.choices[0]?.message?.content ?? "";
  const tokensUsed = completion.usage?.total_tokens ?? 0;

  res.json(SendChatResponse.parse({ message: responseText, tokensUsed }));
});

export default router;
