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

  async getForUser(userId: string): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, userId))
      .orderBy(asc(appointments.startsAtUtc));
  }

  async getUpcoming(userId: string, afterUtc: Date): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          gte(appointments.startsAtUtc, afterUtc),
        ),
      )
      .orderBy(asc(appointments.startsAtUtc));
  }

  async delete(id: string): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }
}

export const appointmentsService = new AppointmentsService();
