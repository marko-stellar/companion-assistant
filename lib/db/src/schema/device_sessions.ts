import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Long-lived tablet device sessions.
 * Created when a tablet consumes a valid setup code.
 * Token is stored in the tablet's localStorage and sent as Bearer auth.
 * One active session per user (admin revoke replaces it).
 */
export const deviceSessions = pgTable(
  "device_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 64-char hex token stored in localStorage on the tablet */
    token: varchar("token", { length: 64 }).notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_device_sessions_user").on(t.userId)],
);
