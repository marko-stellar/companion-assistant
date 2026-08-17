import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

/**
 * Pre-seeded AI companion personas. Users choose one during setup.
 * personality_config holds voice_id, system_prompt_text, and any
 * provider-specific settings. Business logic must not rely solely on
 * system_prompt_text — domain services enforce behaviour in code.
 */
export const companions = pgTable("companions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  gender: text("gender").notNull(), // 'male' | 'female'
  tagline: text("tagline"),          // short user-facing description
  personalityConfig: jsonb("personality_config").notNull().$type<{
    voiceId: string;
    systemPromptText: string;
    traits: string[];
    languageStyle: string;
  }>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Companion = typeof companions.$inferSelect;
export type InsertCompanion = typeof companions.$inferInsert;
