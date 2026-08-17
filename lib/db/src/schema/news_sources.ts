import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Curated list of trusted news sources for the news/search domain.
 * The SearchProvider uses these to restrict retrieval to reputable outlets.
 */
export const newsSources = pgTable("news_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url"),
  category: text("category"),
  /** ISO 639-1: "hr" | "en" */
  language: text("language").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(true),
  /** 1 (low) – 10 (high) editorial trust score */
  trustScore: integer("trust_score").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type NewsSource = typeof newsSources.$inferSelect;
export type InsertNewsSource = typeof newsSources.$inferInsert;
