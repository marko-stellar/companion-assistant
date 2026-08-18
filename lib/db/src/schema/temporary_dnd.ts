import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Temporary DND override set by the user mid-conversation ("don't disturb me until 3pm").
 * Unlike dnd_periods (recurring HH:MM windows), this is a one-off absolute-time override.
 * The scheduler and proactivity service check this before dispatching proactive speech.
 */
export const temporaryDnd = pgTable(
  "temporary_dnd",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("temporary_dnd_user_id_idx").on(t.userId),
    index("temporary_dnd_ends_at_idx").on(t.endsAt),
  ],
);

export type TemporaryDnd = typeof temporaryDnd.$inferSelect;
export type InsertTemporaryDnd = typeof temporaryDnd.$inferInsert;
