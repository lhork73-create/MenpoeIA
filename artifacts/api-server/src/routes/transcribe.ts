import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { TranscribeAudioBody, TranscribeAudioResponse } from "@workspace/api-zod";
import { toFile } from "groq-sdk";

const router: IRouter = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

router.post("/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType } = parsed.data;

  const audioBuffer = Buffer.from(audioBase64, "base64");

  const ext = mimeType.includes("webm") ? "webm"
    : mimeType.includes("ogg") ? "ogg"
    : mimeType.includes("wav") ? "wav"
    : mimeType.includes("mp4") ? "mp4"
    : "webm";

  const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-large-v3-turbo",
    response_format: "text",
  });

  const text = typeof transcription === "string" ? transcription : (transcription as { text: string }).text ?? "";

  res.json(TranscribeAudioResponse.parse({ text: text.trim() }));
});

export default router;
