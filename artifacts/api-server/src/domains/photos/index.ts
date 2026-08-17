import { db } from "@workspace/db";
import {
  photos,
  photoMemories,
  type Photo,
  type InsertPhoto,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Photos domain — handles photo metadata and photo-conversation memories.
 * Photo bytes are stored in persistent object storage via StorageProvider.
 * Bytes must never be stored in PostgreSQL or on the deployment filesystem.
 */
export class PhotosService {
  async create(data: InsertPhoto): Promise<Photo> {
    const [photo] = await db.insert(photos).values(data).returning();
    return photo;
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

  async addPhotoMemory(
    photoId: string,
    userId: string,
    memoryContent: string,
  ) {
    const [memory] = await db
      .insert(photoMemories)
      .values({ photoId, userId, memoryContent })
      .returning();
    return memory;
  }

  async getPhotoMemories(photoId: string) {
    return db
      .select()
      .from(photoMemories)
      .where(eq(photoMemories.photoId, photoId));
  }

  /** Mark photo for deletion — caller must also call StorageProvider.delete() */
  async delete(id: string): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }
}

export const photosService = new PhotosService();
