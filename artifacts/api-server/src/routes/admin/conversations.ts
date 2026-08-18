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
import { requireUuidParam } from "../../middlewares/validateParam";

const router = Router();

// ── List conversation sessions for a senior user ──────────────────────────

router.get(
  "/users/:id/conversations",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const userId = String(req.params.id);

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
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const convId = String(req.params.id);

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
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
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const convId = String(req.params.id);

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
      .where(eq(conversationMessages.conversationId, convId))
      .orderBy(conversationMessages.createdAt);

    res.json({ conversation: conv, messages });
  },
);

export default router;
