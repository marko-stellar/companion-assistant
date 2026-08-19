/**
 * Admin trusted news source routes — manage which outlets the companion may
 * read news from. Domain enforcement happens server-side in SearchService,
 * which loads only enabled sources from this table.
 *
 * Routes:
 *   GET    /admin/news-sources        — list all sources
 *   POST   /admin/news-sources        — create (name + url required, url must yield a valid domain)
 *   PATCH  /admin/news-sources/:id    — edit fields / enable / disable
 *   DELETE /admin/news-sources/:id    — remove a source
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, newsSources } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";
import { normalizeDomain } from "../../domains/search";

const router = Router();

const LANGUAGES = ["en", "hr"];

function validateUrl(url: unknown): { ok: true; url: string; domain: string } | { ok: false; error: string } {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: "url is required (e.g. https://www.bbc.com)" };
  }
  const trimmed = url.trim();
  const domain = normalizeDomain(trimmed);
  if (!domain) {
    return { ok: false, error: "url must be a valid http(s) website address (e.g. https://www.bbc.com)" };
  }
  return { ok: true, url: trimmed, domain };
}

// ── List ──────────────────────────────────────────────────────────────────

router.get("/news-sources", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsSources).orderBy(newsSources.name);
  res.json({ sources: rows, total: rows.length });
});

// ── Create ────────────────────────────────────────────────────────────────

router.post("/news-sources", requireAdmin, async (req, res): Promise<void> => {
  const { name, url, category, language, isActive, trustScore } = req.body as {
    name?: string;
    url?: string;
    category?: string;
    language?: string;
    isActive?: boolean;
    trustScore?: number;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const urlCheck = validateUrl(url);
  if (!urlCheck.ok) {
    res.status(400).json({ error: urlCheck.error });
    return;
  }
  if (language !== undefined && !LANGUAGES.includes(language)) {
    res.status(400).json({ error: `language must be one of: ${LANGUAGES.join(", ")}` });
    return;
  }
  if (trustScore !== undefined && (!Number.isInteger(trustScore) || trustScore < 1 || trustScore > 10)) {
    res.status(400).json({ error: "trustScore must be an integer between 1 and 10" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  const [created] = await db
    .insert(newsSources)
    .values({
      name: name.trim().slice(0, 120),
      url: urlCheck.url,
      category: typeof category === "string" && category.trim() ? category.trim().slice(0, 60) : null,
      language: language ?? "en",
      isActive: isActive ?? true,
      trustScore: trustScore ?? 5,
    })
    .returning();

  res.status(201).json({ source: created });
});

// ── Update ────────────────────────────────────────────────────────────────

router.patch("/news-sources/:id", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const id = String(req.params.id);

  const [existing] = await db.select({ id: newsSources.id }).from(newsSources).where(eq(newsSources.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "News source not found" });
    return;
  }

  const { name, url, category, language, isActive, trustScore } = req.body as {
    name?: string;
    url?: string;
    category?: string | null;
    language?: string;
    isActive?: boolean;
    trustScore?: number;
  };

  const updates: Partial<typeof newsSources.$inferInsert> = { updatedAt: new Date() };

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    updates.name = name.trim().slice(0, 120);
  }
  if (url !== undefined) {
    const urlCheck = validateUrl(url);
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    updates.url = urlCheck.url;
  }
  if (category !== undefined) {
    updates.category = typeof category === "string" && category.trim() ? category.trim().slice(0, 60) : null;
  }
  if (language !== undefined) {
    if (!LANGUAGES.includes(language)) {
      res.status(400).json({ error: `language must be one of: ${LANGUAGES.join(", ")}` });
      return;
    }
    updates.language = language;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }
    updates.isActive = isActive;
  }
  if (trustScore !== undefined) {
    if (!Number.isInteger(trustScore) || trustScore < 1 || trustScore > 10) {
      res.status(400).json({ error: "trustScore must be an integer between 1 and 10" });
      return;
    }
    updates.trustScore = trustScore;
  }

  const [updated] = await db.update(newsSources).set(updates).where(eq(newsSources.id, id)).returning();
  res.json({ source: updated });
});

// ── Delete ────────────────────────────────────────────────────────────────

router.delete("/news-sources/:id", requireUuidParam("id"), requireAdmin, async (req, res): Promise<void> => {
  const id = String(req.params.id);

  const [existing] = await db.select({ id: newsSources.id }).from(newsSources).where(eq(newsSources.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "News source not found" });
    return;
  }

  await db.delete(newsSources).where(eq(newsSources.id, id));
  res.json({ ok: true });
});

export default router;
