// apps/booking-app/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "../lib/errors";
import { isProduction } from "../lib/config";

function safeCompare(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Reads an auth key header. Coerces duplicate headers (string[]) to the
 * first value, and rejects values > 256 chars before allocating a Buffer
 * (prevents allocation-DoS from oversized headers).
 */
function readKey(headerValue: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return undefined;
  return raw.length > 256 ? undefined : raw;
}

export function requirePublicKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.API_PUBLIC_KEY;
  if (!expected) {
    if (isProduction()) {
      return errorResponse(res, 503, "SERVICE_UNAVAILABLE", "Authentication not configured");
    }
    return next(); // dev only — validateConfig already warned at boot
  }
  const provided = readKey(req.headers["x-api-key"]);
  if (!provided || !safeCompare(provided, expected)) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Invalid or missing API key");
  }
  next();
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.API_ADMIN_KEY;
  if (!expected) {
    if (isProduction()) {
      return errorResponse(res, 503, "SERVICE_UNAVAILABLE", "Authentication not configured");
    }
    return next();
  }
  const provided = readKey(req.headers["x-admin-key"]);
  if (!provided || !safeCompare(provided, expected)) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Invalid or missing admin key");
  }
  next();
}
