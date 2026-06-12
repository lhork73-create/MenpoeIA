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

router.get("/conversations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversationsTable)
    .orderBy(conversationsTable.createdAt);

  res.json(ListConversationsResponse.parse(
    rows.map((r) => ({
      ...r,
      messages: r.messages as { role: string; content: string }[],
      createdAt: r.createdAt.toISOString(),
    }))
  ));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = SaveConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title, messages: parsed.data.messages })
    .returning();

  res.status(201).json({
    ...row,
    messages: row.messages as { role: string; content: string }[],
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteConversationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  res.json(DeleteConversationResponse.parse({ success: true }));
});

export default router;
