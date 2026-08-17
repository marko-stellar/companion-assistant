import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { photos } from "./photos";
import { users } from "./users";

/**
 * Structured memory extracted from a photo conversation.
 * Linked to the photo; also linked to user for fast retrieval.
 */
export const photoMemories = pgTable(
  "photo_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memoryContent: text("memory_content").notNull(),
    extractedAt: timestamp("extracted_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("photo_memories_photo_id_idx").on(t.photoId),
    index("photo_memories_user_id_idx").on(t.userId),
  ],
);

export type PhotoMemory = typeof photoMemories.$inferSelect;
export type InsertPhotoMemory = typeof photoMemories.$inferInsert;
