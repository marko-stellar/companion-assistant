import { db } from "@workspace/db";
import { users, type User, type InsertUser } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

/**
 * Users domain — manages senior user profiles.
 * One user per tablet. Timezone is required for all scheduling.
 */
export class UsersService {
  async getById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getAll(): Promise<User[]> {
    return db.select().from(users);
  }

  async create(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async update(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}

export const usersService = new UsersService();
