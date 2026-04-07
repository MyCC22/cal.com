// apps/booking-app/src/lib/errors.ts
import type { Request, Response } from "express";

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

/**
 * Logs the full error server-side with the request id, returns a sanitized
 * envelope that never leaks Prisma/SQL/connection details to the client.
 * Replaces every `res.status(500).json({ message: error.message })` pattern.
 */
export function internalError(req: Request, res: Response, error: unknown) {
  const id = (req as Request & { requestId?: string }).requestId || "unknown";
  // eslint-disable-next-line no-console
  console.error(`[${id}] internal error:`, error);
  return errorResponse(res, 500, "INTERNAL_ERROR", "An internal error occurred", { requestId: id });
}

/**
 * Validates a string field is at most `max` characters. Returns true if valid.
 * Caller is responsible for sending the 400 if false.
 */
export function withinMaxLength(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length <= max;
}

/**
 * Field length caps for request bodies. Centralized so values stay consistent
 * across POST/PATCH/booking handlers.
 */
export const FIELD_LIMITS = {
  email: 320,    // RFC 5321
  name: 200,
  username: 64,
  timeZone: 64,
  title: 200,
  slug: 200,
  notes: 1000,
  reason: 1000,
} as const;

// Practical email format check — not full RFC 5322.
// Rejects: "foo", "@x.com", "a b@c.com", "foo@bar..com" (consecutive dots),
// "foo@.com" (leading dot in domain), "foo@bar" (no TLD).
// Accepts all real-world emails.
//
// Structure: local@segment(.segment)+ where each domain segment has no
// dots, no whitespace, and no @. The local part is lenient and allows
// dots so "first.last@x.com" still validates.
const EMAIL_RX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && EMAIL_RX.test(v);
}

// HH:MM 24-hour, zero-padded. Hours 00-23, minutes 00-59.
const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type AvailabilityWindow = {
  days: number[];
  startTime: string;
  endTime: string;
};

/**
 * Validates an availability window shape. Rejects:
 * - non-object / null
 * - non-array or empty days
 * - days containing non-integers, negatives, or values > 6
 * - non-string startTime / endTime
 * - time strings not matching HH:MM 24-hour format
 * - startTime >= endTime (covers equality and overnight shifts;
 *   consumers must split overnight coverage into two windows per the spec)
 *
 * Accepts (intentionally):
 * - duplicate days within a single window (harmless; Prisma treats days as a set)
 * - extra unknown fields on the window (handler maps only the 3 known fields)
 */
export function isValidAvailabilityWindow(w: unknown): w is AvailabilityWindow {
  if (typeof w !== "object" || w === null) return false;
  const x = w as { days?: unknown; startTime?: unknown; endTime?: unknown };
  if (!Array.isArray(x.days) || x.days.length === 0) return false;
  if (!x.days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) return false;
  if (typeof x.startTime !== "string" || !TIME_RX.test(x.startTime)) return false;
  if (typeof x.endTime !== "string" || !TIME_RX.test(x.endTime)) return false;
  // Lexicographic comparison works for zero-padded HH:MM.
  if (x.startTime >= x.endTime) return false;
  return true;
}
