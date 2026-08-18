import { db } from "@workspace/db";
import {
  reminders,
  reminderOccurrences,
  type Reminder,
  type ReminderOccurrence,
  type InsertReminder,
  type InsertReminderOccurrence,
} from "@workspace/db/schema";
import { eq, and, lte, gt, isNull, isNotNull, asc } from "drizzle-orm";

/**
 * Reminders domain — manages GENERAL and MEDICATION reminders.
 *
 * Reminders store LOCAL wall-clock times (localTime "HH:MM" +
 * recurrenceDays, or localDate for one-time). The scheduler converts to
 * UTC and materialises reminder_occurrences; idempotency is guaranteed
 * by the unique (reminder_id, scheduled_for_utc) constraint.
 */
export class RemindersService {
  async createReminder(data: InsertReminder): Promise<Reminder> {
    const [reminder] = await db.insert(reminders).values(data).returning();
    return reminder;
  }

  async getById(id: string): Promise<Reminder | null> {
    const [row] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.id, id))
      .limit(1);
    return row ?? null;
  }

  async getForUser(
    userId: string,
    opts: { type?: string; includeInactive?: boolean } = {},
  ): Promise<Reminder[]> {
    const conditions = [eq(reminders.userId, userId)];
    if (!opts.includeInactive) conditions.push(eq(reminders.isActive, true));
    if (opts.type) conditions.push(eq(reminders.type, opts.type));
    return db
      .select()
      .from(reminders)
      .where(and(...conditions))
      .orderBy(asc(reminders.localTime));
  }

  /**
   * Update a reminder. When schedule-defining fields (localTime,
   * recurrenceDays, localDate) change — or the reminder is deactivated —
   * all pending (untriggered, unanswered) occurrences are deleted so the
   * scheduler regenerates them from the new schedule; otherwise stale
   * pre-materialised occurrences would keep firing at the old times.
   */
  async updateReminder(
    id: string,
    data: Partial<InsertReminder>,
  ): Promise<Reminder | null> {
    const scheduleChanged =
      data.localTime !== undefined ||
      data.recurrenceDays !== undefined ||
      data.localDate !== undefined ||
      data.isActive === false;

    const [row] = await db
      .update(reminders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reminders.id, id))
      .returning();

    if (row && scheduleChanged) {
      await this.deletePendingOccurrences(id);
    }
    return row ?? null;
  }

  async deactivateReminder(id: string): Promise<void> {
    await db
      .update(reminders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(reminders.id, id));
    // Pending occurrences of a deactivated reminder must never fire.
    await this.deletePendingOccurrences(id);
  }

  /** Delete occurrences that have not been triggered or answered yet. */
  async deletePendingOccurrences(reminderId: string): Promise<void> {
    await db
      .delete(reminderOccurrences)
      .where(
        and(
          eq(reminderOccurrences.reminderId, reminderId),
          isNull(reminderOccurrences.triggeredAt),
          isNull(reminderOccurrences.response),
        ),
      );
  }

  /** All active reminders across users (scheduler generation pass). */
  async getAllActive(): Promise<Reminder[]> {
    return db.select().from(reminders).where(eq(reminders.isActive, true));
  }

  /**
   * Insert upcoming occurrences; ON CONFLICT DO NOTHING makes re-runs
   * (and scheduler restarts) idempotent.
   */
  async upsertUpcomingOccurrences(
    reminderId: string,
    scheduledForUtcs: Date[],
  ): Promise<void> {
    if (scheduledForUtcs.length === 0) return;
    const values: InsertReminderOccurrence[] = scheduledForUtcs.map(
      (scheduledForUtc) => ({ reminderId, scheduledForUtc }),
    );
    await db.insert(reminderOccurrences).values(values).onConflictDoNothing();
  }

  /**
   * Occurrences due for triggering: scheduled ≤ now, untriggered,
   * unanswered, and belonging to an active reminder.
   */
  async getDueOccurrences(nowUtc: Date): Promise<ReminderOccurrence[]> {
    const rows = await db
      .select({ occurrence: reminderOccurrences })
      .from(reminderOccurrences)
      .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
      .where(
        and(
          lte(reminderOccurrences.scheduledForUtc, nowUtc),
          isNull(reminderOccurrences.triggeredAt),
          isNull(reminderOccurrences.response),
          eq(reminders.isActive, true),
        ),
      );
    return rows.map((r) => r.occurrence);
  }

  /** Next `limit` upcoming (future, untriggered) occurrences of a reminder. */
  async getUpcomingOccurrences(
    reminderId: string,
    nowUtc: Date,
    limit = 7,
  ): Promise<ReminderOccurrence[]> {
    return db
      .select()
      .from(reminderOccurrences)
      .where(
        and(
          eq(reminderOccurrences.reminderId, reminderId),
          gt(reminderOccurrences.scheduledForUtc, nowUtc),
          isNull(reminderOccurrences.triggeredAt),
        ),
      )
      .orderBy(asc(reminderOccurrences.scheduledForUtc))
      .limit(limit);
  }

  async markTriggered(occurrenceId: string, nowUtc: Date): Promise<void> {
    await db
      .update(reminderOccurrences)
      .set({ triggeredAt: nowUtc, firedAtUtc: nowUtc })
      .where(
        and(
          eq(reminderOccurrences.id, occurrenceId),
          isNull(reminderOccurrences.triggeredAt),
        ),
      );
  }

  /** DND skip: record NOT_REQUIRED without triggering. */
  async markNotRequired(occurrenceId: string, nowUtc: Date): Promise<void> {
    await db
      .update(reminderOccurrences)
      .set({ response: "NOT_REQUIRED", respondedAt: nowUtc, skipped: true })
      .where(
        and(
          eq(reminderOccurrences.id, occurrenceId),
          isNull(reminderOccurrences.response),
        ),
      );
  }

  /**
   * Persist a user confirmation (YES / NO / UNKNOWN) on an occurrence.
   * Atomic state transition: only succeeds if the occurrence has been
   * triggered and has no answer yet — a recorded response can never be
   * overwritten, and future/unfired occurrences cannot be answered.
   * Returns false if no eligible occurrence was updated.
   */
  async respond(
    occurrenceId: string,
    response: "YES" | "NO" | "UNKNOWN",
  ): Promise<boolean> {
    const now = new Date();
    const rows = await db
      .update(reminderOccurrences)
      .set({ response, respondedAt: now, acknowledgedAt: now })
      .where(
        and(
          eq(reminderOccurrences.id, occurrenceId),
          isNull(reminderOccurrences.response),
          isNotNull(reminderOccurrences.triggeredAt),
        ),
      )
      .returning({ id: reminderOccurrences.id });
    return rows.length > 0;
  }

  /** Occurrence joined with its reminder (for ownership checks). */
  async getOccurrenceWithReminder(
    occurrenceId: string,
  ): Promise<{ occurrence: ReminderOccurrence; reminder: Reminder } | null> {
    const [row] = await db
      .select({ occurrence: reminderOccurrences, reminder: reminders })
      .from(reminderOccurrences)
      .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
      .where(eq(reminderOccurrences.id, occurrenceId))
      .limit(1);
    return row ?? null;
  }
}

export const remindersService = new RemindersService();
