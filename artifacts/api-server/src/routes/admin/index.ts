import { Router, type IRouter } from "express";
import authRouter from "./auth";
import usersRouter from "./users";
import companionsRouter from "./companions";
import deviceRouter from "./device";

/**
 * Admin API route group — /api/admin/*
 * All routes except /auth/login require a valid admin session cookie.
 * Session is set by POST /api/admin/auth/login.
 */
const router: IRouter = Router();

// Ping — sanity check for admin API connectivity
router.get("/ping", (_req, res) => {
  res.json({ ok: true, area: "admin" });
});

router.use(authRouter);
router.use(companionsRouter); // also handles /dashboard
router.use(usersRouter);
router.use(deviceRouter);

export default router;
