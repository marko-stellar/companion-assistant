import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";

/**
 * Photos uploaded by the user. Bytes are stored in persistent object
 * storage (StorageProvider). Only metadata + object key lives here.
 */
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Key in the StorageProvider (e.g. "photos/<userId>/<uuid>.jpg") */
    objectKey: text("object_key").notNull(),
    filename: text("filename"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    /** Short description or alt-text from LLM image analysis */
    description: text("description"),
    /** Conversation in which this photo was first shared */
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("photos_user_id_idx").on(t.userId),
    index("photos_created_at_idx").on(t.createdAt),
  ],
);

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;
