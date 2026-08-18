import { db } from "@workspace/db";
import {
  appointments,
  type Appointment,
  type InsertAppointment,
} from "@workspace/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";

/**
 * Appointments domain — manages the user's calendar events.
 * No external calendar integration in the MVP.
 * All timestamps stored in UTC; display converts via user.timezone.
 */
export class AppointmentsService {
  async create(data: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db
      .insert(appointments)
      .values(data)
      .returning();
    return appointment;
  }

  async getById(id: string): Promise<Appointment | null> {
    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    return row ?? null;
  }

  async getForUser(
    userId: string,
    opts: { includeInactive?: boolean } = {},
  ): Promise<Appointment[]> {
    const conditions = [eq(appointments.userId, userId)];
    if (!opts.includeInactive)
      conditions.push(eq(appointments.isActive, true));
    return db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(asc(appointments.startsAtUtc));
  }

  async getUpcoming(userId: string, afterUtc: Date): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.isActive, true),
          gte(appointments.startsAtUtc, afterUtc),
        ),
      )
      .orderBy(asc(appointments.startsAtUtc));
  }

  async update(
    id: string,
    data: Partial<InsertAppointment>,
  ): Promise<Appointment | null> {
    const [row] = await db
      .update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return row ?? null;
  }

  /** Soft delete via isActive. */
  async deactivate(id: string): Promise<void> {
    await db
      .update(appointments)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(appointments.id, id));
  }
}

export const appointmentsService = new AppointmentsService();
