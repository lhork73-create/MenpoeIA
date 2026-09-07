import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversationsTable } from "@workspace/db";
import {
  SaveConversationBody,
  DeleteConversationParams,
  ListConversationsResponse,
  DeleteConversationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

interface FallbackConversation {
  id: number;
  title: string;
  messages: Array<{ role: string; content: string }>;
  createdAt: Date;
}

const fallbackConversations: FallbackConversation[] = [];
let nextConvId = 1;

router.get("/conversations", async (_req, res): Promise<void> => {
  if (db) {
    try {
      const rows = await db
        .select()
        .from(conversationsTable)
        .orderBy(conversationsTable.createdAt);

      res.json(ListConversationsResponse.parse(
        rows.map((r: any) => ({
          ...r,
          messages: r.messages as { role: string; content: string }[],
          createdAt: r.createdAt.toISOString(),
        }))
      ));
      return;
    } catch {
      // Postgres error fallback
    }
  }

  res.json(ListConversationsResponse.parse(
    fallbackConversations.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    }))
  ));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = SaveConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (db) {
    try {
      const [row] = await db
        .insert(conversationsTable)
        .values({ title: parsed.data.title, messages: parsed.data.messages })
        .returning();

      res.status(201).json({
        ...row,
        messages: row.messages as { role: string; content: string }[],
        createdAt: row.createdAt.toISOString(),
      });
      return;
    } catch {
      // Postgres error fallback
    }
  }

  const newConv: FallbackConversation = {
    id: nextConvId++,
    title: parsed.data.title,
    messages: parsed.data.messages as { role: string; content: string }[],
    createdAt: new Date(),
  };
  fallbackConversations.push(newConv);

  res.status(201).json({
    ...newConv,
    createdAt: newConv.createdAt.toISOString(),
  });
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteConversationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (db) {
    try {
      await db
        .delete(conversationsTable)
        .where(eq(conversationsTable.id, params.data.id));

      res.json(DeleteConversationResponse.parse({ success: true }));
      return;
    } catch {
      // Postgres error fallback
    }
  }

  const idx = fallbackConversations.findIndex((c) => c.id === params.data.id);
  if (idx !== -1) {
    fallbackConversations.splice(idx, 1);
  }

  res.json(DeleteConversationResponse.parse({ success: true }));
});

export default router;
