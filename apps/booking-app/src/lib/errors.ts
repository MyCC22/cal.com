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
 * Strict integer ID parser.
 * Rejects: "1.5", "1abc", "01", "1e2", "0x10", " 5 ", negatives, zero,
 * and values exceeding Postgres int4 max (2,147,483,647).
 * Returns null on any malformed input — caller should respond with 400.
 */
export function parseId(raw: string): number | null {
  // Digits only, no leading zero, no scientific notation, no whitespace.
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) return null;
  return n;
}

/** True if value is a non-empty, non-whitespace string. */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** True if value is a positive integer (rejects 0, negatives, floats, non-numbers). */
export function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * Maps a Prisma P2002 unique-violation error onto a specific
 * application code based on the constraint that fired.
 *
 * Primary path: inspects e.code === "P2002" and e.meta.target.
 *
 * Fallback path: some Prisma versions / interactive transactions wrap the
 * error such that e.code and e.meta are not present at the top level. In
 * that case we sniff the message string for "Unique constraint failed".
 * This is a deliberate deviation from the original spec ("returns null if
 * not P2002") because without it, slug/email/username collisions inside
 * $transaction(...) silently degrade to generic 500s. Pinned to current
 * Prisma 6.x message format — if Prisma changes this string in a future
 * upgrade, the fallback stops working and collisions return 500 again
 * (degraded but not catastrophic).
 *
 * Returns null if the error is not a unique violation or doesn't match a
 * known field.
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
