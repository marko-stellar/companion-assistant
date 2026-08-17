import type { Request, Response, NextFunction } from "express";
import { type ZodSchema, ZodError } from "zod";

type RequestTarget = "body" | "query" | "params";

/**
 * Request validation middleware factory using Zod schemas.
 * Rejects requests with 400 and structured error details.
 *
 * Usage:
 *   router.post("/reminders", validate(insertReminderSchema), handler)
 */
export function validate<T>(
  schema: ZodSchema<T>,
  target: RequestTarget = "body",
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation error", issues });
      return;
    }
    // Replace with parsed+coerced data
    (req as Record<string, unknown>)[target] = result.data;
    next();
  };
}
