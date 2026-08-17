import { Router } from "express";
import { eq, count } from "drizzle-orm";
import { db, companions, users } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router = Router();

/** GET /admin/companions */
router.get("/companions", requireAdmin, async (req, res): Promise<void> => {
  const all = await db
    .select({
      id: companions.id,
      name: companions.name,
      gender: companions.gender,
      tagline: companions.tagline,
      isActive: companions.isActive,
    })
    .from(companions)
    .where(eq(companions.isActive, true));

  res.json(all);
});

/** GET /admin/dashboard */
router.get("/dashboard", requireAdmin, async (req, res): Promise<void> => {
  const allUsers = await db
    .select({ isActive: users.isActive, companionId: users.companionId })
    .from(users);

  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter((u) => u.isActive).length;

  // Build companion distribution
  const countMap = new Map<string | null, number>();
  for (const u of allUsers) {
    const key = u.companionId ?? null;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const allCompanions = await db
    .select({ id: companions.id, name: companions.name })
    .from(companions);
  const nameOf = new Map(allCompanions.map((c) => [c.id, c.name]));

  const companionDistribution = Array.from(countMap.entries()).map(
    ([companionId, cnt]) => ({
      companionId,
      companionName: companionId ? (nameOf.get(companionId) ?? "Unknown") : "Unassigned",
      count: cnt,
    }),
  );

  res.json({ totalUsers, activeUsers, companionDistribution });
});

export default router;
