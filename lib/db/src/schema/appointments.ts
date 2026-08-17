import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * User appointments (doctor, family visit, etc.).
 * No external calendar integration in the MVP.
 * All times stored in UTC.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAtUtc: timestamp("starts_at_utc").notNull(),
    endsAtUtc: timestamp("ends_at_utc"),
    /** Minutes before startsAtUtc to remind the user */
    reminderMinutesBefore: integer("reminder_minutes_before")
      .notNull()
      .default(30),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("appointments_user_id_idx").on(t.userId),
    index("appointments_starts_at_utc_idx").on(t.startsAtUtc),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;
