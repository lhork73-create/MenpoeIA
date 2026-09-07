import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

let fallbackSettings = {
  id: 1,
  avatarName: "Mirror",
  avatarAge: 25,
  avatarPersonality: "Helpful and intelligent",
  avatarTone: "Professional but warm",
  voiceId: "Fritz-PlayAI",
  voiceSpeed: 1.0,
  voiceVolume: 1.0,
  systemPrompt: "You are Mirror, an intelligent AI assistant. Be concise, helpful, and personable. Keep responses under 3 sentences unless asked for more detail.",
};

async function getOrCreateSettings() {
  if (db) {
    try {
      const rows = await db.select().from(settingsTable).limit(1);
      if (rows.length > 0) return rows[0];

      const [row] = await db.insert(settingsTable).values({}).returning();
      return row;
    } catch {
      // Postgres error fallback
    }
  }
  return fallbackSettings;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(settings));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (db) {
    try {
      const existing = await getOrCreateSettings();
      const [updated] = await db
        .update(settingsTable)
        .set(parsed.data)
        .where(eq(settingsTable.id, existing.id))
        .returning();
      res.json(UpdateSettingsResponse.parse(updated));
      return;
    } catch {
      // Postgres error fallback
    }
  }

  fallbackSettings = {
    ...fallbackSettings,
    ...parsed.data,
  };
  res.json(UpdateSettingsResponse.parse(fallbackSettings));
});

export default router;
