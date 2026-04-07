// apps/booking-app/src/lib/errors.ts
import type { Response } from "express";

export function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return res.status(status).json({
    status: "error",
    code,
    message,
    ...(extra || {}),
  });
}

/**
 * Strict integer ID parser. Rejects "1.5", "1abc", negatives, zero.
 * parseInt is too lenient — it accepts those.
 */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Maps a Prisma P2002 unique-violation error onto a specific
 * application code based on the constraint that fired.
 * Returns null if the error is not P2002 or doesn't match a known field.
 */
export function uniqueViolationCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return null;
  const target = Array.isArray(e.meta?.target)
    ? e.meta!.target.join(",")
    : (e.meta?.target as string | undefined) || "";
  if (target.includes("slug")) return "SLUG_TAKEN";
  if (target.includes("email")) return "EMAIL_TAKEN";
  if (target.includes("username")) return "USERNAME_TAKEN";
  return null;
}

/**
 * Returns true if the error is a Postgres serialization failure
 * surfaced by Prisma (P2034). Caller should return 503.
 */
export function isSerializationFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string };
  return e.code === "P2034";
}
