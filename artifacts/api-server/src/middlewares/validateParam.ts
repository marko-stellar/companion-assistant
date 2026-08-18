import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const UuidSchema = z.string().uuid();

/**
 * Middleware that validates a named route parameter is a plain UUID string.
 * Returns 400 if the parameter is an array or not a valid UUID.
 *
 * Place before requireAdmin / handler in any route that uses `:id` or similar
 * UUID route params so bad values are rejected before reaching the database.
 *
 * Usage:
 *   router.get("/users/:id", requireUuidParam("id"), requireAdmin, handler)
 */
export function requireUuidParam(name: string = "id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[name];
    if (Array.isArray(raw)) {
      res
        .status(400)
        .json({ error: `Route parameter '${name}' must be a single value` });
      return;
    }
    if (!UuidSchema.safeParse(raw).success) {
      res
        .status(400)
        .json({ error: `Route parameter '${name}' must be a valid UUID` });
      return;
    }
    next();
  };
}
