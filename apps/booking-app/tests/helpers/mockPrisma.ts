// apps/booking-app/tests/helpers/mockPrisma.ts
//
// Type-only module. The actual mock is constructed inline inside
// tests/setup.ts using vi.hoisted() because vi.mock's factory closure
// needs access to the mock BEFORE regular module code runs, and
// require()ing a sibling .ts file from inside vi.hoisted() fails — the
// Node resolver doesn't see Vite's transform at hoist time.
//
// Previously this file exported a `createMockPrisma()` factory that was
// never actually called (setup.ts had to inline it anyway). Keeping two
// parallel shapes caused drift. This file now only re-exports the type
// of whatever setup.ts builds, so tests can still type their mock
// configuration consistently.

import type { Mock } from "vitest";

// Model-level shape used by every Prisma model in our handlers.
// Each property is a vitest Mock — tests configure return values via
// mockPrisma.user.update.mockResolvedValue(...).
type PrismaModelMock = {
  create: Mock;
  update: Mock;
  delete: Mock;
  deleteMany: Mock;
  findUnique: Mock;
  findFirst: Mock;
  findMany: Mock;
  count: Mock;
  updateMany: Mock;
};

export type MockPrisma = {
  user: PrismaModelMock;
  schedule: PrismaModelMock;
  eventType: PrismaModelMock;
  booking: PrismaModelMock;
  availability: {
    create: Mock;
    createMany: Mock;
    deleteMany: Mock;
  };
  host: {
    count: Mock;
    deleteMany: Mock;
  };
  $transaction: Mock;
  $queryRaw: Mock;
};
