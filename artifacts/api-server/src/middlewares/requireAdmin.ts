import { type Request, type Response, type NextFunction } from "express";

/**
 * Middleware that rejects unauthenticated requests to admin routes.
 * Sets req.session.adminId after successful login via POST /admin/auth/login.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
