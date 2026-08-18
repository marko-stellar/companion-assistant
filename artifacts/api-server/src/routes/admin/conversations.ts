/**
 * Admin conversation routes — read-only transcript access.
 *
 * All routes require a valid admin session cookie (requireAdmin middleware).
 * Transcripts are treated as sensitive — only authorised admin staff may read them.
 *
 * Routes:
 *   GET /admin/users/:id/conversations         — list sessions for a user
 *   GET /admin/conversations/:id              — single session metadata
 *   GET /admin/conversations/:id/messages     — timestamped transcript
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, users, conversations, conversationMessages } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router = Router();

// ── List conversation sessions for a senior user ──────────────────────────

router.get(
  "/users/:id/conversations",
  requireAdmin,
  async (req, res): Promise<void> => {
    const userId = req.params.id as string;

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.startedAt))
      .limit(100);

    res.json({ conversations: rows });
  },
);

// ── Single conversation metadata ──────────────────────────────────────────

router.get(
  "/conversations/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id as string))
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation: conv });
  },
);

// ── Conversation transcript (timestamped messages) ────────────────────────

router.get(
  "/conversations/:id/messages",
  requireAdmin,
  async (req, res): Promise<void> => {
    const convId = req.params.id as string;

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Transcripts are sensitive — return content but do NOT log it server-side
    const messages = await db
      .select({
        id: conversationMessages.id,
        role: conversationMessages.role,
        content: conversationMessages.content,
        language: conversationMessages.language,
        latencyMs: conversationMessages.latencyMs,
        providerMeta: conversationMessages.providerMeta,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, convId as string))
      .orderBy(conversationMessages.createdAt);

    res.json({ conversation: conv, messages });
  },
);

export default router;
