import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { TranscribeAudioBody, TranscribeAudioResponse } from "@workspace/api-zod";
import { toFile } from "groq-sdk";

const router: IRouter = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
const GEMINI_TRANSCRIBE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY || "placeholder" });
}

function mimeToExt(mimeType: string): string {
  const m = mimeType.toLowerCase().split(";")[0].trim();
  if (m.includes("webm"))  return "webm";
  if (m.includes("ogg"))   return "ogg";
  if (m.includes("wav"))   return "wav";
  if (m.includes("flac"))  return "flac";
  if (m.includes("mp4"))   return "m4a";   // iOS graba mp4, Whisper necesita m4a
  if (m.includes("aac"))   return "m4a";   // aac también como m4a
  if (m.includes("mpeg"))  return "mp3";
  if (m.includes("mp3"))   return "mp3";
  return "webm";
}

// Transcribe audio usando Google Gemini Multimodal
async function transcribeWithGemini(audioBase64: string, mimeType: string): Promise<string> {
  const cleanMime = mimeType.split(";")[0].trim() || "audio/webm";

  const body = JSON.stringify({
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
            text: "Eres un transcriptor de voz a texto en español altamente preciso. Transcribe EXACTAMENTE lo que dice la persona en este audio. Devuelve ÚNICAMENTE el texto que escuchas, sin comillas, sin introducciones ni explicaciones. Si el audio está completamente en silencio o solo contiene ruido ininteligible, responde exactamente: [VACIO]",
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500,
    },
  });

  let lastErr: unknown = null;
  for (const model of GEMINI_TRANSCRIBE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Transcribe] ${model} HTTP ${res.status}:`, errText.slice(0, 200));
        continue;
      }

      const json: any = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      if (rawText.includes("[VACIO]") || rawText.includes("[SILENCIO]")) {
        return "";
      }
      return rawText;
    } catch (err) {
      lastErr = err;
      console.warn(`[Gemini Transcribe] ${model} failed:`, err);
    }
  }

  throw lastErr || new Error("No se pudo transcribir el audio con Gemini");
}

router.post("/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType } = parsed.data;

  // Si el audio es sumamente corto o vacío, responder limpiamente sin error 400
  if (!audioBase64 || audioBase64.length < 100) {
    res.json(TranscribeAudioResponse.parse({ text: "" }));
    return;
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (audioBuffer.length < 500) {
    res.json(TranscribeAudioResponse.parse({ text: "" }));
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const hasValidGroq = groqKey && groqKey.trim() !== "" && groqKey !== "gsk_..." && !groqKey.includes("placeholder");

  // 1. Intentar con Groq Whisper si está configurado
  if (hasValidGroq) {
    try {
      const ext = mimeToExt(mimeType);
      const effectiveMime = ext === "m4a" ? "audio/mp4" : mimeType.split(";")[0];
      const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: effectiveMime });

      const transcription = await getGroq().audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3-turbo",
        response_format: "text",
        language: "es",
      });

      const text = typeof transcription === "string"
        ? transcription
        : (transcription as { text: string }).text ?? "";

      res.json(TranscribeAudioResponse.parse({ text: text.trim() }));
      return;
    } catch (groqErr) {
      console.warn("[Transcribe] Groq Whisper failed, trying Gemini fallback...", groqErr);
    }
  }

  // 2. Fallback resiliente con Google Gemini Multimodal Transcribe
  try {
    const text = await transcribeWithGemini(audioBase64, mimeType);
    res.json(TranscribeAudioResponse.parse({ text: text.trim() }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err, mimeType }, "Transcription failed on all providers");
    res.status(500).json({ error: `Error de transcripción: ${message}` });
  }
});

export default router;
