/**
 * Admin photo routes — upload, list, delete, signed-URL generation.
 *
 * Upload flow (two-step presigned URL):
 *   1. POST /admin/photos/upload-url           → returns presigned PUT URL + objectPath
 *   2. Client PUTs file bytes directly to GCS via the presigned URL
 *   3. POST /admin/users/:userId/photos        → register metadata, trigger vision analysis
 *
 * The file bytes NEVER pass through this server — only metadata does.
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, photos } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";
import { ObjectStorageService } from "../../lib/objectStorage";
import { photosService } from "../../domains/photos";
import { photoVisionService } from "../../services/photo-vision.service";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ── GET presigned upload URL ──────────────────────────────────────────────────

/**
 * POST /admin/photos/upload-url
 * Returns a presigned PUT URL and objectPath.
 * The client uploads the file bytes directly to GCS; this server only mints the URL.
 */
router.post("/photos/upload-url", requireAdmin, async (req, res): Promise<void> => {
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    req.log.error({ err }, "Failed to generate presigned upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── Register photo after upload ───────────────────────────────────────────────

/**
 * POST /admin/users/:userId/photos
 * Called after the client has uploaded the file to GCS.
 * Records metadata in DB and triggers async vision analysis.
 */
router.post(
  "/users/:userId/photos",
  requireAdmin,
  requireUuidParam("userId"),
  async (req, res): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const {
      objectPath,
      contentType,
      filename,
      title,
      approxDate,
      location,
      notes,
      sizeBytes,
    } = req.body as {
      objectPath?: string;
      contentType?: string;
      filename?: string;
      title?: string;
      approxDate?: string;
      location?: string;
      notes?: string;
      sizeBytes?: number;
    };

    if (!objectPath || typeof objectPath !== "string") {
      res.status(400).json({ error: "objectPath is required" });
      return;
    }

    const photo = await photosService.create({
      userId,
      objectKey: objectPath,
      contentType: contentType ?? null,
      filename: filename ?? null,
      title: title ?? null,
      approxDate: approxDate ?? null,
      location: location ?? null,
      notes: notes ?? null,
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
    });

    req.log.info({ userId, photoId: photo.id }, "Photo registered");

    // Trigger async vision analysis — never blocks the response
    void photoVisionService.analyzeAndStore(photo);

    res.status(201).json({ photo });
  },
);

// ── List photos ───────────────────────────────────────────────────────────────

/**
 * GET /admin/users/:userId/photos
 * Returns all photos for a user with fresh signed GET URLs (1 hour TTL).
 */
router.get(
  "/users/:userId/photos",
  requireAdmin,
  requireUuidParam("userId"),
  async (req, res): Promise<void> => {
    const { userId } = req.params as { userId: string };

    const rows = await db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(desc(photos.createdAt));

    // Generate signed URLs in parallel (max 1 h TTL)
    const photosWithUrls = await Promise.all(
      rows.map(async (p) => {
        let signedUrl: string | null = null;
        try {
          signedUrl = await objectStorageService.getObjectEntityReadURL(p.objectKey, 3600);
        } catch {
          // If the file doesn't exist in GCS yet, return null URL
        }
        return { ...p, signedUrl };
      }),
    );

    res.json({ photos: photosWithUrls });
  },
);

// ── Get single photo with signed URL ─────────────────────────────────────────

/**
 * GET /admin/photos/:photoId
 * Returns one photo record plus a signed URL.
 */
router.get(
  "/photos/:photoId",
  requireAdmin,
  requireUuidParam("photoId"),
  async (req, res): Promise<void> => {
    const { photoId } = req.params as { photoId: string };
    const photo = await photosService.getById(photoId);
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    let signedUrl: string | null = null;
    try {
      signedUrl = await objectStorageService.getObjectEntityReadURL(photo.objectKey, 3600);
    } catch { /* no-op */ }
    res.json({ photo: { ...photo, signedUrl } });
  },
);

// ── Re-run vision analysis ────────────────────────────────────────────────────

/**
 * POST /admin/photos/:photoId/analyze
 * Manually re-trigger vision analysis for a photo.
 */
router.post(
  "/photos/:photoId/analyze",
  requireAdmin,
  requireUuidParam("photoId"),
  async (req, res): Promise<void> => {
    const { photoId } = req.params as { photoId: string };
    const photo = await photosService.getById(photoId);
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    void photoVisionService.analyzeAndStore(photo);
    res.json({ ok: true, message: "Vision analysis queued" });
  },
);

// ── Update metadata ───────────────────────────────────────────────────────────

/**
 * PATCH /admin/photos/:photoId
 * Update admin-provided metadata fields (title, approxDate, location, notes).
 */
router.patch(
  "/photos/:photoId",
  requireAdmin,
  requireUuidParam("photoId"),
  async (req, res): Promise<void> => {
    const { photoId } = req.params as { photoId: string };
    const { title, approxDate, location, notes } = req.body as {
      title?: string;
      approxDate?: string;
      location?: string;
      notes?: string;
    };

    const photo = await photosService.getById(photoId);
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const updated = await photosService.updateMetadata(photoId, { title, approxDate, location, notes });
    res.json({ photo: updated });
  },
);

// ── Delete photo ──────────────────────────────────────────────────────────────

/**
 * DELETE /admin/photos/:photoId
 * Deletes from DB and attempts to delete from GCS.
 */
router.delete(
  "/photos/:photoId",
  requireAdmin,
  requireUuidParam("photoId"),
  async (req, res): Promise<void> => {
    const { photoId } = req.params as { photoId: string };
    const photo = await photosService.getById(photoId);
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    // Delete from DB first
    await photosService.delete(photoId);

    // Best-effort GCS deletion
    try {
      const file = await objectStorageService.getObjectEntityFile(photo.objectKey);
      await file.delete();
    } catch (err) {
      req.log.warn({ err, photoId }, "GCS deletion failed — DB record removed");
    }

    req.log.info({ photoId, userId: photo.userId }, "Photo deleted");
    res.json({ ok: true });
  },
);

export default router;
