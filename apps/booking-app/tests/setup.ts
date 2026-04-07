// apps/booking-app/tests/setup.ts
import { beforeEach, vi } from "vitest";
import type { MockPrisma } from "./helpers/mockPrisma";

// Test-time env vars. Set BEFORE importing any app module so
// validateConfig / isProduction see the right values.
process.env.NODE_ENV = "test";
process.env.API_PUBLIC_KEY = "test-public-key";
process.env.API_ADMIN_KEY = "test-admin-key";
process.env.CORS_ORIGINS = "http://test";

// vi.mock() is hoisted to the top of the file at compile time, BEFORE any
// regular module code runs. vi.hoisted() runs its callback in the same
// hoisting pass, but its body cannot require() sibling .ts files — the
// Node resolver doesn't know about Vite's transform at hoist time. So we
// inline the mock factory here. The helpers/mockPrisma.ts file still
// exports the MockPrisma *type* for use in handler code (types erase at
// runtime so there's no TDZ issue on the type-only import above).
const { mockPrisma } = vi.hoisted(() => {
  // Every model method we call in handlers needs a stub. If a handler
  // ever reaches a method not in this list, the mock returns undefined
  // where real Prisma would throw — that's a silent-pass-through footgun.
  // Keep this in sync with the shape in tests/helpers/mockPrisma.ts.
  const makeModel = () => ({
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    mockPrisma: {
      user: makeModel(),
      schedule: makeModel(),
      eventType: makeModel(),
      booking: makeModel(),
      availability: {
        create: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      host: {
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock("@calcom/prisma", () => ({
  default: mockPrisma,
}));

// Re-export so tests can `import { mockPrisma } from "../setup"`.
export { mockPrisma };
export type MockPrismaShape = typeof mockPrisma;

// Silence expected console output from internalError so test output stays readable.
// Individual tests can spy on console.error themselves if they need to assert on it.
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  // Reset all mock call counts and implementations between tests to
  // avoid state bleed.
  const resetModel = (model: Record<string, unknown>) => {
    for (const key of Object.keys(model)) {
      const fn = model[key];
      if (typeof fn === "function" && "mockReset" in (fn as object)) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }
  };
  resetModel(mockPrisma.user);
  resetModel(mockPrisma.schedule);
  resetModel(mockPrisma.eventType);
  resetModel(mockPrisma.booking);
  resetModel(mockPrisma.availability);
  resetModel(mockPrisma.host);
  mockPrisma.$transaction.mockReset();
  mockPrisma.$queryRaw.mockReset();

  // Default $transaction implementation: invoke the callback with
  // mockPrisma as the "tx" client. We only mock the interactive form.
  mockPrisma.$transaction.mockImplementation(async (cbOrOps: unknown) => {
    if (typeof cbOrOps === "function") {
      return (cbOrOps as (tx: unknown) => Promise<unknown>)(mockPrisma);
    }
    return cbOrOps;
  });
});
