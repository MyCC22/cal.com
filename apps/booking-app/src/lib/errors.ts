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
  const e = error as { code?: string; message?: string; meta?: { target?: string[] | string } };
  // P2002 is the canonical Prisma unique-violation code, but some Prisma
  // versions wrap the error so e.code is not present at the top level.
  // Fall back to message-string sniffing for "Unique constraint failed".
  const isUnique = e.code === "P2002" || /Unique constraint failed/i.test(e.message || "");
  if (!isUnique) return null;
  const target = Array.isArray(e.meta?.target)
    ? e.meta!.target.join(",")
    : (e.meta?.target as string | undefined) || "";
  // Check meta first, then fall back to scanning the message text
  // (some wrappers strip meta.target).
  const haystack = (target + " " + (e.message || "")).toLowerCase();
  if (haystack.includes("slug")) return "SLUG_TAKEN";
  if (haystack.includes("email")) return "EMAIL_TAKEN";
  if (haystack.includes("username")) return "USERNAME_TAKEN";
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
