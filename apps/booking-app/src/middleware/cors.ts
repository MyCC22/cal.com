// apps/booking-app/src/middleware/cors.ts
import type { Request, Response, NextFunction } from "express";

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowed = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;

  if (allowed.length === 0) {
    // No allow-list configured: dev fallback to wildcard
    res.header("Access-Control-Allow-Origin", "*");
  } else {
    // Always set Vary: Origin when an allow-list is configured to prevent
    // cache poisoning across origins, regardless of whether this request matches.
    res.header("Vary", "Origin");
    if (typeof origin === "string" && allowed.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    // Otherwise omit the header entirely → browser blocks
  }
  // Note: Access-Control-Allow-Credentials is intentionally not set —
  // this API uses header-based auth, not cookies. If cookies are added
  // later, this needs to be re-evaluated to avoid CSRF.

  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-admin-key");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}
