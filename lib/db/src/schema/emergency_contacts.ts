import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** E.164 format preferred, e.g. "+38591..." */
    phone: text("phone").notNull(),
    relationship: text("relationship"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("emergency_contacts_user_id_idx").on(t.userId)],
);

export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type InsertEmergencyContact = typeof emergencyContacts.$inferInsert;
