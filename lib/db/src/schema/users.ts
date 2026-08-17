import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { companions } from "./companions";

/**
 * One senior user per tablet. Timezone is required — all scheduling
 * and display logic converts from UTC storage to this timezone.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    /** IANA timezone string, e.g. "Europe/Zagreb" */
    timezone: text("timezone").notNull().default("UTC"),
    /** ISO 639-1 language code: "hr" | "en" */
    language: text("language").notNull().default("en"),
    companionId: uuid("companion_id").references(() => companions.id),
    tabletPinHash: text("tablet_pin_hash"),
    isActive: boolean("is_active").notNull().default(true),
    setupCompletedAt: timestamp("setup_completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("users_companion_id_idx").on(t.companionId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
