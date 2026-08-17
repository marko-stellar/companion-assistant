import type { Request, Response, NextFunction } from "express";

/**
 * Global error handler middleware.
 * Must be registered LAST with app.use() after all routes.
 * Structured errors are logged via pino-http (req.log).
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const error = err instanceof Error ? err : new Error(String(err));

  req.log.error(
    {
      err: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    },
    "Unhandled error",
  );

  // Do not leak internal details in production
  const isProduction = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: "Internal server error",
    ...(isProduction ? {} : { message: error.message }),
  });
}
