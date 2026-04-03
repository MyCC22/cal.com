// apps/booking-app/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";

export function requirePublicKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"] as string | undefined;
  const expected = process.env.API_PUBLIC_KEY;

  if (!expected) {
    // No key configured = auth disabled (dev mode)
    return next();
  }

  if (!key || key !== expected) {
    return res.status(401).json({
      status: "error",
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    });
  }

  next();
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"] as string | undefined;
  const expected = process.env.API_ADMIN_KEY;

  if (!expected) {
    return next();
  }

  if (!key || key !== expected) {
    return res.status(401).json({
      status: "error",
      code: "UNAUTHORIZED",
      message: "Invalid or missing admin key",
    });
  }

  next();
}
