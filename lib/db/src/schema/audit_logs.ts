import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Immutable audit trail for admin actions and system events.
 * Append-only: no updates or deletes on this table.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'admin' | 'system' */
    actorType: text("actor_type").notNull(),
    /** UUID of the admin or null for system actions */
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_id_idx").on(t.actorId),
    index("audit_logs_entity_id_idx").on(t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
