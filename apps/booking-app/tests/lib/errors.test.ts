// apps/booking-app/tests/lib/errors.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  parseId,
  withinMaxLength,
  isNonEmptyString,
  isPositiveInt,
  isValidEmail,
  isValidAvailabilityWindow,
  uniqueViolationCode,
  isSerializationFailure,
  errorResponse,
  internalError,
} from "../../src/lib/errors";

describe("parseId", () => {
  it("accepts 1, 42, and int4 max", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("42")).toBe(42);
    expect(parseId("2147483647")).toBe(2147483647);
  });
  it("rejects int4 overflow", () => {
    expect(parseId("2147483648")).toBeNull();
    expect(parseId("9999999999999999999")).toBeNull();
  });
  it("rejects floats and alphanumeric garbage", () => {
    expect(parseId("1.5")).toBeNull();
    expect(parseId("1abc")).toBeNull();
    expect(parseId("abc")).toBeNull();
  });
  it("rejects leading zero, scientific notation, hex", () => {
    expect(parseId("01")).toBeNull();
    expect(parseId("1e2")).toBeNull();
    expect(parseId("0x10")).toBeNull();
  });
  it("rejects whitespace and empty string", () => {
    expect(parseId(" 5 ")).toBeNull();
    expect(parseId("")).toBeNull();
  });
  it("rejects zero and negatives", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-1")).toBeNull();
  });
});

describe("withinMaxLength", () => {
  it("accepts within limit", () => {
    expect(withinMaxLength("abc", 10)).toBe(true);
    expect(withinMaxLength("", 10)).toBe(true);
  });
  it("rejects over limit", () => {
    expect(withinMaxLength("abcdefghijk", 10)).toBe(false);
  });
  it("rejects non-string", () => {
    expect(withinMaxLength(123, 10)).toBe(false);
    expect(withinMaxLength(null, 10)).toBe(false);
  });
});

describe("isNonEmptyString", () => {
  it("accepts real string", () => {
    expect(isNonEmptyString("abc")).toBe(true);
  });
  it("rejects empty", () => {
    expect(isNonEmptyString("")).toBe(false);
  });
  it("rejects whitespace-only", () => {
    expect(isNonEmptyString("   ")).toBe(false);
  });
});

describe("isPositiveInt", () => {
  it("accepts 1 and larger", () => {
    expect(isPositiveInt(1)).toBe(true);
    expect(isPositiveInt(100)).toBe(true);
  });
  it("rejects 0", () => {
    expect(isPositiveInt(0)).toBe(false);
  });
  it("rejects negatives", () => {
    expect(isPositiveInt(-1)).toBe(false);
  });
  it("rejects floats", () => {
    expect(isPositiveInt(1.5)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts real-world emails", () => {
    expect(isValidEmail("foo@bar.com")).toBe(true);
    expect(isValidEmail("first.last@example.co.uk")).toBe(true);
    expect(isValidEmail("foo+bar@x.com")).toBe(true);
    expect(isValidEmail("a@b.c")).toBe(true);
  });
  it("rejects missing @ or TLD", () => {
    expect(isValidEmail("foo")).toBe(false);
    expect(isValidEmail("foo@bar")).toBe(false);
  });
  it("rejects consecutive dots in domain", () => {
    expect(isValidEmail("foo@bar..com")).toBe(false);
  });
  it("rejects leading dot in domain", () => {
    expect(isValidEmail("foo@.com")).toBe(false);
  });
  it("rejects missing local or domain", () => {
    expect(isValidEmail("@x.com")).toBe(false);
    expect(isValidEmail("foo@")).toBe(false);
  });
  it("rejects whitespace", () => {
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
  it("rejects non-string", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
  });
});

describe("isValidAvailabilityWindow", () => {
  const valid = { days: [1, 2, 3], startTime: "09:00", endTime: "17:00" };

  it("accepts a valid window", () => {
    expect(isValidAvailabilityWindow(valid)).toBe(true);
  });
  it("rejects non-object or null", () => {
    expect(isValidAvailabilityWindow(null)).toBe(false);
    expect(isValidAvailabilityWindow("string")).toBe(false);
    expect(isValidAvailabilityWindow(42)).toBe(false);
  });
  it("rejects missing or empty days", () => {
    expect(isValidAvailabilityWindow({ ...valid, days: undefined })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, days: [] })).toBe(false);
  });
  it("rejects non-array days", () => {
    expect(isValidAvailabilityWindow({ ...valid, days: "monday" })).toBe(false);
  });
  it("rejects days out of range", () => {
    expect(isValidAvailabilityWindow({ ...valid, days: [7] })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, days: [-1] })).toBe(false);
  });
  it("rejects non-integer days (floats and NaN)", () => {
    expect(isValidAvailabilityWindow({ ...valid, days: [1.5] })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, days: [NaN] })).toBe(false);
  });
  it("rejects bad time format", () => {
    expect(isValidAvailabilityWindow({ ...valid, startTime: "9am" })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, endTime: "24:00" })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, startTime: null })).toBe(false);
  });
  it("rejects startTime >= endTime (equality and overnight)", () => {
    expect(isValidAvailabilityWindow({ ...valid, startTime: "10:00", endTime: "10:00" })).toBe(false);
    expect(isValidAvailabilityWindow({ ...valid, startTime: "22:00", endTime: "06:00" })).toBe(false);
  });
});

describe("uniqueViolationCode", () => {
  it("maps P2002 + email target → EMAIL_TAKEN", () => {
    expect(uniqueViolationCode({ code: "P2002", meta: { target: ["email"] } })).toBe("EMAIL_TAKEN");
  });
  it("maps P2002 + composite slug target → SLUG_TAKEN", () => {
    expect(uniqueViolationCode({ code: "P2002", meta: { target: ["userId", "slug"] } })).toBe("SLUG_TAKEN");
  });
  it("maps P2002 + username target → USERNAME_TAKEN", () => {
    expect(uniqueViolationCode({ code: "P2002", meta: { target: ["username"] } })).toBe("USERNAME_TAKEN");
  });
  it("returns null for null and primitive inputs", () => {
    expect(uniqueViolationCode(null)).toBeNull();
    expect(uniqueViolationCode("string")).toBeNull();
  });
});

describe("isSerializationFailure", () => {
  it("returns true for P2034", () => {
    expect(isSerializationFailure({ code: "P2034" })).toBe(true);
  });
  it("returns false for everything else", () => {
    expect(isSerializationFailure({ code: "P2025" })).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure("string")).toBe(false);
  });
});

describe("errorResponse", () => {
  it("merges extra fields at the top level of the envelope, not under data", () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    errorResponse(
      mockRes as unknown as Parameters<typeof errorResponse>[0],
      409,
      "HAS_DEPENDENCIES",
      "nope",
      { blockers: { bookings: 3 } },
    );
    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: "error",
      code: "HAS_DEPENDENCIES",
      message: "nope",
      blockers: { bookings: 3 },
    });
  });
});

describe("internalError", () => {
  it("returns 500 with INTERNAL_ERROR code and requestId from req", () => {
    const mockReq = { requestId: "req-abc-123" };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    internalError(
      mockReq as unknown as Parameters<typeof internalError>[0],
      mockRes as unknown as Parameters<typeof internalError>[1],
      new Error("prisma internal"),
    );
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
        requestId: "req-abc-123",
      }),
    );
  });
  it("does not leak the raw error message in the response", () => {
    const mockReq = { requestId: "req-abc" };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    internalError(
      mockReq as unknown as Parameters<typeof internalError>[0],
      mockRes as unknown as Parameters<typeof internalError>[1],
      new Error("sql: SELECT * FROM users WHERE email = ..."),
    );
    const body = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.message).not.toContain("sql");
    expect(body.message).not.toContain("SELECT");
  });
  it("falls back to 'unknown' requestId when req.requestId is missing", () => {
    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    internalError(
      mockReq as unknown as Parameters<typeof internalError>[0],
      mockRes as unknown as Parameters<typeof internalError>[1],
      new Error("x"),
    );
    const body = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.requestId).toBe("unknown");
  });
});
