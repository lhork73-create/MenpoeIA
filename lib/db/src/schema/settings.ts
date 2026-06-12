import { pgTable, serial, text, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  avatarName: text("avatar_name").notNull().default("Mirror"),
  avatarAge: integer("avatar_age").notNull().default(25),
  avatarPersonality: text("avatar_personality").notNull().default("Helpful and intelligent"),
  avatarTone: text("avatar_tone").notNull().default("Professional but warm"),
  voiceId: text("voice_id").notNull().default("Fritz-PlayAI"),
  voiceSpeed: real("voice_speed").notNull().default(1.0),
  voiceVolume: real("voice_volume").notNull().default(1.0),
  systemPrompt: text("system_prompt").notNull().default("You are Mirror, an intelligent AI assistant. Be concise, helpful, and personable. Keep responses under 3 sentences unless asked for more detail."),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
