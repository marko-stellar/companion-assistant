/**
 * Creates the first (or any) admin user.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run create-admin admin@example.com MySecurePass123
 *
 * Safe to run multiple times — skips if the email already exists.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, admins } from "@workspace/db";

const email = process.argv[2]?.toLowerCase().trim();
const password = process.argv[3];

if (!email || !password) {
  console.error(
    "Usage: pnpm --filter @workspace/api-server run create-admin <email> <password>",
  );
  process.exit(1);
}

if (password.length < 8) {
  console.error("Error: password must be at least 8 characters");
  process.exit(1);
}

const [existing] = await db
  .select({ id: admins.id })
  .from(admins)
  .where(eq(admins.email, email));

if (existing) {
  console.log(`Admin already exists: ${email}`);
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);
const [admin] = await db
  .insert(admins)
  .values({ email, passwordHash })
  .returning({ id: admins.id, email: admins.email });

console.log(`✓ Admin created: ${admin.email} (id: ${admin.id})`);
process.exit(0);
