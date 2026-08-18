/**
 * Admin memory routes — inspect and manage long-term memories.
 *
 * All routes require a valid admin session (requireAdmin).
 * These are read-write: admin can correct, deactivate, or reactivate memories.
 *
 * Routes:
 *   GET  /admin/users/:id/memories           — list (optional ?type= filter, ?active=true/false/all)
 *   GET  /admin/memories/:id                 — single memory with superseded chain
 *   PATCH /admin/memories/:id               — edit fact, subject, type, confidence, emotional_context
 *   POST  /admin/memories/:id/deactivate    — soft-delete
 *   POST  /admin/memories/:id/reactivate    — un-delete
 */

import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, users, memories } from "@workspace/db";
import { MEMORY_TYPES } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";

const router = Router();

// ── List memories for a user ──────────────────────────────────────────────

router.get("/users/:id/memories", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.id);
  const typeFilter = req.query.type as string | undefined;
  const activeFilter = req.query.active as string | undefined; // "true" | "false" | "all"

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Build WHERE conditions
  const conditions = [eq(memories.userId, userId)];

  if (typeFilter && MEMORY_TYPES.includes(typeFilter as typeof MEMORY_TYPES[number])) {
    conditions.push(eq(memories.type, typeFilter));
  }

  if (activeFilter === "false") {
    conditions.push(eq(memories.isActive, false));
  } else if (activeFilter !== "all") {
    // Default: show only active
    conditions.push(eq(memories.isActive, true));
  }

  const rows = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(200);

  res.json({ memories: rows, total: rows.length });
});

// ── Single memory with superseded chain ───────────────────────────────────

router.get("/memories/:id", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const memId = String(req.params.id);

  const [mem] = await db.select().from(memories).where(eq(memories.id, memId)).limit(1);
  if (!mem) { res.status(404).json({ error: "Memory not found" }); return; }

  // Build the superseded chain (walk back via supersedesMemoryId)
  const chain: typeof mem[] = [];
  let cursor = mem.supersedesMemoryId;
  let depth = 0;
  while (cursor && depth < 10) {
    const [ancestor] = await db.select().from(memories).where(eq(memories.id, cursor)).limit(1);
    if (!ancestor) break;
    chain.push(ancestor);
    cursor = ancestor.supersedesMemoryId;
    depth++;
  }

  res.json({ memory: mem, supersedesChain: chain });
});

// ── Edit a memory ─────────────────────────────────────────────────────────

router.patch("/memories/:id", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const memId = String(req.params.id);

  const [existing] = await db.select({ id: memories.id }).from(memories).where(eq(memories.id, memId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Memory not found" }); return; }

  const { type, subject, fact, confidence, emotionalContext } = req.body as {
    type?: string;
    subject?: string;
    fact?: string;
    confidence?: number;
    emotionalContext?: string;
  };

  const updates: Partial<{
    type: string;
    subject: string | null;
    fact: string;
    confidence: number;
    emotionalContext: string | null;
    sourceType: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (type !== undefined) {
    if (!MEMORY_TYPES.includes(type as typeof MEMORY_TYPES[number])) {
      res.status(400).json({ error: `Invalid type. Must be one of: ${MEMORY_TYPES.join(", ")}` });
      return;
    }
    updates.type = type;
  }
  if (subject !== undefined) updates.subject = subject ?? null;
  if (fact !== undefined && fact.trim()) {
    updates.fact = fact.trim();
    // Mark the source as admin-corrected
    updates.sourceType = "admin";
  }
  if (confidence !== undefined) {
    const c = Number(confidence);
    if (isNaN(c) || c < 0 || c > 1) {
      res.status(400).json({ error: "Confidence must be between 0 and 1" });
      return;
    }
    updates.confidence = c;
  }
  if (emotionalContext !== undefined) updates.emotionalContext = emotionalContext ?? null;

  const [updated] = await db
    .update(memories)
    .set(updates)
    .where(eq(memories.id, memId))
    .returning();

  res.json({ memory: updated });
});

// ── Deactivate (soft-delete) ──────────────────────────────────────────────

router.post("/memories/:id/deactivate", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const memId = String(req.params.id);

  const [mem] = await db.select({ id: memories.id }).from(memories).where(eq(memories.id, memId)).limit(1);
  if (!mem) { res.status(404).json({ error: "Memory not found" }); return; }

  await db.update(memories).set({ isActive: false, updatedAt: new Date() }).where(eq(memories.id, memId));
  res.json({ ok: true });
});

// ── Reactivate ────────────────────────────────────────────────────────────

router.post("/memories/:id/reactivate", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const memId = String(req.params.id);

  const [mem] = await db.select({ id: memories.id }).from(memories).where(eq(memories.id, memId)).limit(1);
  if (!mem) { res.status(404).json({ error: "Memory not found" }); return; }

  await db.update(memories).set({ isActive: true, updatedAt: new Date() }).where(eq(memories.id, memId));
  res.json({ ok: true });
});

export default router;
