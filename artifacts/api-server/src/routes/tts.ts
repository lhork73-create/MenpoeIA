import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { TextToSpeechBody, TextToSpeechResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VALID_VOICES = [
  "Arista-PlayAI", "Atlas-PlayAI", "Basil-PlayAI", "Briggs-PlayAI",
  "Calum-PlayAI", "Celeste-PlayAI", "Cheyenne-PlayAI", "Chip-PlayAI",
  "Cillian-PlayAI", "Deedee-PlayAI", "Eleanor-PlayAI", "Fritz-PlayAI",
  "Gail-PlayAI", "George-PlayAI", "Giulia-PlayAI", "Grace-PlayAI",
  "Huxley-PlayAI", "Indigo-PlayAI", "Mamaw-PlayAI", "Mason-PlayAI",
  "Mikail-PlayAI", "Mitch-PlayAI", "Myra-PlayAI", "Nyx-PlayAI",
  "Nia-PlayAI", "Quinn-PlayAI", "Thunder-PlayAI", "Zia-PlayAI",
];

router.post("/tts", async (req, res): Promise<void> => {
  const parsed = TextToSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, voice, speed } = parsed.data;

  const selectedVoice = (voice && VALID_VOICES.includes(voice)) ? voice : "Fritz-PlayAI";

  const audioResponse = await groq.audio.speech.create({
    model: "playai-tts",
    input: text,
    voice: selectedVoice,
    response_format: "wav",
    speed: speed ?? 1.0,
  });

  const arrayBuffer = await audioResponse.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  const audioBase64 = audioBuffer.toString("base64");

  res.json(TextToSpeechResponse.parse({ audioBase64 }));
});

export default router;
