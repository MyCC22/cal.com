// apps/booking-app/tests/helpers/mockPrisma.ts
import { vi } from "vitest";

/**
 * Hand-rolled mock of the @calcom/prisma default export. Covers every
 * method actually called by admin.ts, bookings.ts, slots.ts, and probe.ts
 * handlers. Methods default to no-ops; tests configure return values
 * per case via `mockPrisma.user.update.mockResolvedValue(...)`.
 *
 * Types are intentionally loose (Mock<any, any>) — matches the existing
 * booking-app code style and avoids the maintenance cost of tracking
 * every Prisma generic signature.
 */
export function createMockPrisma() {
  return {
    user: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    schedule: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    eventType: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    booking: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    availability: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    host: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
