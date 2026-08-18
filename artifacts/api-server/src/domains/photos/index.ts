import { eq, desc } from "drizzle-orm";
import { db, photos } from "@workspace/db";
import type { Photo, InsertPhoto } from "@workspace/db";

/**
 * Photos domain — handles photo metadata.
 * Photo bytes are stored in persistent object storage (ObjectStorageService).
 * Bytes must never be stored in PostgreSQL or on the deployment filesystem.
 */
export class PhotosService {
  async create(data: InsertPhoto): Promise<Photo> {
    const [photo] = await db.insert(photos).values(data).returning();
    return photo!;
  }

  async getForUser(userId: string): Promise<Photo[]> {
    return db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(desc(photos.createdAt));
  }

  async getById(id: string): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(eq(photos.id, id));
    return photo;
  }

  async updateMetadata(
    id: string,
    data: {
      title?: string;
      approxDate?: string;
      location?: string;
      notes?: string;
    },
  ): Promise<Photo> {
    const [updated] = await db
      .update(photos)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(photos.id, id))
      .returning();
    return updated!;
  }

  async updateVisionDescription(id: string, description: string): Promise<void> {
    await db
      .update(photos)
      .set({ visionDescription: description, updatedAt: new Date() })
      .where(eq(photos.id, id));
  }

  /** Mark photo for deletion — caller must also call ObjectStorageService to delete the file */
  async delete(id: string): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }
}

export const photosService = new PhotosService();
