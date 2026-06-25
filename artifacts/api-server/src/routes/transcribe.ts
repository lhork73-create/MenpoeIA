import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { TranscribeAudioBody, TranscribeAudioResponse } from "@workspace/api-zod";
import { toFile } from "groq-sdk";

const router: IRouter = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Mimetypes soportados por Whisper y sus extensiones correctas
// IMPORTANTE: audio/mp4 → m4a (no mp4), audio/aac → m4a
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
  return "webm"; // fallback
}

router.post("/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType } = parsed.data;

  if (!audioBase64 || audioBase64.length < 100) {
    res.status(400).json({ error: "Audio vacío o demasiado corto" });
    return;
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  if (audioBuffer.length < 1000) {
    res.status(400).json({ error: "Audio demasiado corto para transcribir" });
    return;
  }

  const ext = mimeToExt(mimeType);

  // Para m4a/mp4, Whisper necesita el tipo correcto
  const effectiveMime = ext === "m4a" ? "audio/mp4" : mimeType.split(";")[0];

  try {
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: effectiveMime });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      response_format: "text",
      language: "es",   // forzar español en transcripción
    });

    const text = typeof transcription === "string"
      ? transcription
      : (transcription as { text: string }).text ?? "";

    res.json(TranscribeAudioResponse.parse({ text: text.trim() }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err, ext, mimeType }, "Transcription failed");
    res.status(400).json({ error: `Error de transcripción: ${message}` });
  }
});

export default router;
