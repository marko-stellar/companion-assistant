/**
 * PhotoVisionService — runs LLM image analysis on an uploaded photo and
 * stores the neutral vision description in the database.
 *
 * IDENTITY RULE (enforced in prompt and in service):
 *   The description must NEVER name or guess the identity of any person
 *   based solely on their appearance. Identity comes only from admin-provided
 *   metadata or from what the user states in conversation.
 */

import { eq } from "drizzle-orm";
import { db, photos } from "@workspace/db";
import type { Photo } from "@workspace/db";
import { visionProvider } from "../providers/registry";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const objectStorageService = new ObjectStorageService();

const VISION_SYSTEM_PROMPT = `You are analyzing a photograph for a senior care digital companion system.

Describe the visible content in neutral, objective terms. Include:
- Setting (indoor/outdoor, type of room or location if recognisable from surroundings, decor, or signs — not from faces)
- Number of people visible and general appearance (approximate age range, clothing style, posture, activities)
- Objects, furniture, food, or environmental details
- Overall mood or occasion suggested by the scene

CRITICAL RULES:
1. Do NOT attempt to identify, name, or guess the specific identity of any person based on their appearance.
2. Do not say "this looks like [name]", "this could be [person]", or infer identity from faces.
3. Describe only objectively visible characteristics (hair colour, clothing colour, approximate age range, posture).
4. If there is text visible in the image (signs, labels, dates on photos), you may read it.

Keep your description to 3–5 sentences.`;

export class PhotoVisionService {
  /**
   * Download the photo from object storage, run vision analysis, and store
   * the description. Called fire-and-forget after a photo is registered.
   * Errors are logged but never surfaced to the caller.
   */
  async analyzeAndStore(photo: Photo): Promise<void> {
    try {
      await this.doAnalyze(photo);
    } catch (err) {
      logger.error({ err, photoId: photo.id }, "Photo vision analysis failed");
    }
  }

  private async doAnalyze(photo: Photo): Promise<void> {
    if (!photo.objectKey) throw new Error("Photo has no objectKey");

    let imageData = "";
    if (visionProvider.requiresImageData) {
      // Real vision providers receive bytes through a short-lived signed URL.
      const signedUrl = await objectStorageService.getObjectEntityReadURL(
        photo.objectKey,
        900,
      );

      const imageRes = await fetch(signedUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!imageRes.ok) {
        throw new Error(`Failed to download photo (${imageRes.status})`);
      }

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const contentType = photo.contentType ?? "image/jpeg";
      const base64 = buffer.toString("base64");
      imageData = `data:${contentType};base64,${base64}`;
    }

    // Run real analysis or return a deterministic mock description.
    const result = await visionProvider.analyzeImage({
      imageData,
      prompt: VISION_SYSTEM_PROMPT,
      language: "en",
    });

    const description = result.description.trim();

    // 3. Store in DB
    await db
      .update(photos)
      .set({ visionDescription: description, updatedAt: new Date() })
      .where(eq(photos.id, photo.id));

    logger.info({ photoId: photo.id, descLen: description.length }, "Photo vision description stored");
  }
}

export const photoVisionService = new PhotoVisionService();
