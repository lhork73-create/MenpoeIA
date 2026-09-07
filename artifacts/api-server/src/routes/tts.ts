import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { TextToSpeechBody, TextToSpeechResponse } from "@workspace/api-zod";

const router: IRouter = Router();
function getGroq() { return new Groq({ apiKey: process.env.GROQ_API_KEY || "placeholder" }); }

// Orpheus TTS voices (canopylabs/orpheus-v1-english)
const ORPHEUS_VOICES = ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"];

router.post("/tts", async (req, res): Promise<void> => {
  const parsed = TextToSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, voice, speed } = parsed.data;

  const selectedVoice = (voice && ORPHEUS_VOICES.includes(voice.toLowerCase()))
    ? voice.toLowerCase()
    : "tara";

  const audioResponse = await getGroq().audio.speech.create({
    model: "canopylabs/orpheus-v1-english",
    input: text,
    voice: selectedVoice,
    response_format: "wav",
    speed: speed ?? 1.0,
  } as any);

  const arrayBuffer = await audioResponse.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

  res.json(TextToSpeechResponse.parse({ audioBase64 }));
});

export default router;
