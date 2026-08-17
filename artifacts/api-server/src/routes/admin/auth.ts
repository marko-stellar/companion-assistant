import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, admins } from "@workspace/db";
import { LoginAdminBody } from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router = Router();

/** POST /admin/auth/login */
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, normalizedEmail));

  if (!admin || !admin.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.adminId = admin.id;
  await db
    .update(admins)
    .set({ lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  req.log.info({ adminId: admin.id }, "Admin logged in");
  res.json({ id: admin.id, email: admin.email, displayName: admin.displayName });
});

/** POST /admin/auth/logout */
router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) req.log.error({ err }, "Session destroy error");
  });
  res.json({ message: "Logged out" });
});

/** GET /admin/auth/me */
router.get("/auth/me", requireAdmin, async (req, res): Promise<void> => {
  const [admin] = await db
    .select({ id: admins.id, email: admins.email, displayName: admins.displayName })
    .from(admins)
    .where(eq(admins.id, req.session.adminId!));

  if (!admin) {
    res.status(401).json({ error: "Session invalid" });
    return;
  }

  res.json(admin);
});

export default router;
