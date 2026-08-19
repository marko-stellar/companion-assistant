import { Router } from "express";
import { eq, and, or, ilike } from "drizzle-orm";
import {
  db,
  users,
  companions,
  emergencyContacts,
  dndPeriods,
} from "@workspace/db";
import {
  CreateAdminUserBody,
  UpdateAdminUserBody,
  ListAdminUsersQueryParams,
  UpsertEmergencyContactBody,
  UpsertDndPeriodBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";

const router = Router();

// ── User list ────────────────────────────────────────────────────────────────

/** GET /admin/users */
router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const query = ListAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const search = query.data.search?.trim();

  const searchFilter = search
    ? or(
        ilike(users.displayName, `%${search}%`),
        ilike(users.firstName, `%${search}%`),
        ilike(users.lastName, `%${search}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      displayName: users.displayName,
      timezone: users.timezone,
      language: users.language,
      isActive: users.isActive,
      companionId: users.companionId,
      companionName: companions.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(companions, eq(users.companionId, companions.id))
    .where(searchFilter)
    .orderBy(users.createdAt);

  res.json(rows);
});

// ── User create ───────────────────────────────────────────────────────────────

/** POST /admin/users */
router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const displayName = `${data.firstName} ${data.lastName}`;

  const [user] = await db
    .insert(users)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      displayName,
      preferredFormOfAddress: data.preferredFormOfAddress,
      timezone: data.timezone,
      language: data.language,
      companionId: data.companionId,
      isActive: data.isActive ?? true,
    })
    .returning();

  // Fetch with companion for the detail response
  const detail = await getUserDetail(user.id);
  if (!detail) {
    res.status(500).json({ error: "Failed to fetch created user" });
    return;
  }

  req.log.info({ userId: user.id }, "User created");
  res.status(201).json(detail);
});

// ── User detail ───────────────────────────────────────────────────────────────

/** GET /admin/users/:id */
router.get(
  "/users/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const detail = await getUserDetail(id);
    if (!detail) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(detail);
  },
);

// ── User update ───────────────────────────────────────────────────────────────

/** PATCH /admin/users/:id */
router.patch(
  "/users/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const parsed = UpdateAdminUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const updates: Partial<typeof users.$inferInsert> = {
      ...data,
      updatedAt: new Date(),
    };

    // Keep displayName in sync
    if (data.firstName !== undefined || data.lastName !== undefined) {
      const [current] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, id));
      if (current) {
        const fn = data.firstName ?? current.firstName ?? "";
        const ln = data.lastName ?? current.lastName ?? "";
        updates.displayName = `${fn} ${ln}`.trim();
      }
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const detail = await getUserDetail(id);
    req.log.info({ userId: id }, "User updated");
    res.json(detail);
  },
);

// ── Emergency contact ─────────────────────────────────────────────────────────

/** GET /admin/users/:id/emergency-contact */
router.get(
  "/users/:id/emergency-contact",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const [ec] = await db
      .select()
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.userId, id),
          eq(emergencyContacts.isPrimary, true),
        ),
      );

    if (!ec) {
      res.status(404).json({ error: "No emergency contact configured" });
      return;
    }

    res.json(ec);
  },
);

/** PUT /admin/users/:id/emergency-contact */
router.put(
  "/users/:id/emergency-contact",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const parsed = UpsertEmergencyContactBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;

    // Normalize phone: strip spaces, allow +, digits, dashes, parens
    const phone = data.phone.replace(/[^\d+\-() ]/g, "").trim();

    const ec = await db.transaction(async (tx) => {
      // Delete existing primary contact for this user
      await tx
        .delete(emergencyContacts)
        .where(
          and(
            eq(emergencyContacts.userId, id),
            eq(emergencyContacts.isPrimary, true),
          ),
        );

      const [inserted] = await tx
        .insert(emergencyContacts)
        .values({
          userId: id,
          name: data.name,
          phone,
          relationship: data.relationship,
          isActive: data.isActive ?? true,
          isPrimary: true,
        })
        .returning();

      return inserted;
    });

    req.log.info({ userId: id }, "Emergency contact upserted");
    res.json(ec);
  },
);

// ── DND period ────────────────────────────────────────────────────────────────

/** GET /admin/users/:id/dnd */
router.get(
  "/users/:id/dnd",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const [dnd] = await db
      .select()
      .from(dndPeriods)
      .where(eq(dndPeriods.userId, id));

    if (!dnd) {
      res.status(404).json({ error: "No DND period configured" });
      return;
    }

    res.json(dnd);
  },
);

/** PUT /admin/users/:id/dnd */
router.put(
  "/users/:id/dnd",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);

    const parsed = UpsertDndPeriodBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;

    const dnd = await db.transaction(async (tx) => {
      // One DND period per user for MVP — replace any existing
      await tx.delete(dndPeriods).where(eq(dndPeriods.userId, id));

      const [inserted] = await tx
        .insert(dndPeriods)
        .values({
          userId: id,
          label: data.label,
          startTime: data.startTime,
          endTime: data.endTime,
          recurrenceDays: data.recurrenceDays ?? [],
          isActive: data.isActive ?? true,
        })
        .returning();

      return inserted;
    });

    req.log.info({ userId: id }, "DND period upserted");
    res.json(dnd);
  },
);

// ── Private helpers ───────────────────────────────────────────────────────────

async function getUserDetail(id: string) {
  const [row] = await db
    .select({ user: users, companion: companions })
    .from(users)
    .leftJoin(companions, eq(users.companionId, companions.id))
    .where(eq(users.id, id));

  if (!row) return null;

  // Exclude internal fields not in the API spec
  const { tabletPinHash, setupCompletedAt, ...userFields } = row.user;

  return {
    ...userFields,
    companion: row.companion ?? undefined,
  };
}

export default router;
