import { db } from "@workspace/db";
import {
  reminders,
  reminderOccurrences,
  type Reminder,
  type ReminderOccurrence,
  type InsertReminder,
} from "@workspace/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";

/**
 * Reminders domain — manages medication, hydration, and other reminders.
 * The scheduler calls getDueOccurrences() each minute.
 * All times are stored in UTC; user.timezone is used for display only.
 */
export class RemindersService {
  async create(data: InsertReminder): Promise<Reminder> {
    const [reminder] = await db.insert(reminders).values(data).returning();
    return reminder;
  }

  async getForUser(userId: string): Promise<Reminder[]> {
    return db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.isActive, true)));
  }

  async deactivate(id: string): Promise<void> {
    await db
      .update(reminders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(reminders.id, id));
  }

  /** Returns occurrences that are due but not yet fired */
  async getDueOccurrences(nowUtc: Date): Promise<ReminderOccurrence[]> {
    return db
      .select()
      .from(reminderOccurrences)
      .where(
        and(
          lte(reminderOccurrences.scheduledForUtc, nowUtc),
          isNull(reminderOccurrences.firedAtUtc),
          eq(reminderOccurrences.skipped, false),
        ),
      );
  }

  async markFired(occurrenceId: string): Promise<void> {
    await db
      .update(reminderOccurrences)
      .set({ firedAtUtc: new Date() })
      .where(eq(reminderOccurrences.id, occurrenceId));
  }

  async acknowledge(occurrenceId: string): Promise<void> {
    await db
      .update(reminderOccurrences)
      .set({ acknowledgedAt: new Date() })
      .where(eq(reminderOccurrences.id, occurrenceId));
  }
}

export const remindersService = new RemindersService();
