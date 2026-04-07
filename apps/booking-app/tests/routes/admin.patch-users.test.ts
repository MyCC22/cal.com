// apps/booking-app/tests/routes/admin.patch-users.test.ts
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp";
import { mockPrisma } from "../setup";

const KEY = "test-admin-key";

describe("PATCH /api/admin/users/:id", () => {
  describe("validators", () => {
    it("rejects empty email with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ email: "" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
    it("rejects oversized email (>320 chars) with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ email: `${"x".repeat(321)}@x.com` });
      expect(res.status).toBe(400);
    });
    it("rejects malformed email format with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ email: "notanemail" });
      expect(res.status).toBe(400);
    });
    it("rejects empty name with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ name: "" });
      expect(res.status).toBe(400);
    });
    it("rejects oversized name (>200 chars) with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ name: "x".repeat(201) });
      expect(res.status).toBe(400);
    });
    it("rejects empty timeZone with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ timeZone: "" });
      expect(res.status).toBe(400);
    });
    it("rejects oversized username (>64 chars) with 400", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ username: "x".repeat(65) });
      expect(res.status).toBe(400);
    });
    it("rejects empty body with 400 'at least one field'", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least one field/);
    });
  });

  describe("defaultScheduleId", () => {
    it("accepts null and clears the pointer", async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 1, email: "a@b.com", name: "A", username: "a", timeZone: "UTC", defaultScheduleId: null,
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ defaultScheduleId: null });
      expect(res.status).toBe(200);
      expect(res.body.data.defaultScheduleId).toBeNull();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultScheduleId: null }),
        }),
      );
    });
    it("accepts valid positive integer and returns it in response", async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 5 });
      mockPrisma.user.update.mockResolvedValue({
        id: 1, email: "a@b.com", name: "A", username: "a", timeZone: "UTC", defaultScheduleId: 5,
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ defaultScheduleId: 5 });
      expect(res.status).toBe(200);
      expect(res.body.data.defaultScheduleId).toBe(5);
      expect(mockPrisma.schedule.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
        select: { id: true },
      });
    });
    it("returns 400 INVALID_REFERENCE when the schedule does not exist", async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ defaultScheduleId: 9999999 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REFERENCE");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
    it("TOCTOU invariant: schedule.findUnique must run INSIDE the $transaction callback", async () => {
      // This test catches the regression where a future refactor moves
      // the existence check back outside the transaction, re-opening
      // the TOCTOU race. It uses a scoped flag flipped by the
      // $transaction mock implementation: findUnique records whether
      // the tx callback was already running when it was called. If the
      // handler calls findUnique BEFORE entering $transaction, the flag
      // is false and the test fails loudly.
      let insideTx = false;
      let findUniqueCalledOutsideTx = false;
      let findUniqueCalledInsideTx = false;

      mockPrisma.$transaction.mockImplementation(async (cbOrOps: unknown) => {
        if (typeof cbOrOps === "function") {
          insideTx = true;
          try {
            return await (cbOrOps as (tx: unknown) => Promise<unknown>)(mockPrisma);
          } finally {
            insideTx = false;
          }
        }
        return cbOrOps;
      });

      mockPrisma.schedule.findUnique.mockImplementation(async () => {
        if (insideTx) findUniqueCalledInsideTx = true;
        else findUniqueCalledOutsideTx = true;
        return { id: 5 };
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 1, email: "a@b.com", name: "A", username: "a", timeZone: "UTC", defaultScheduleId: 5,
      });

      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ defaultScheduleId: 5 });
      expect(res.status).toBe(200);

      // The load-bearing assertions: findUnique MUST happen inside the tx
      // and MUST NOT happen outside it. A regression that moves the check
      // out of the $transaction callback flips both flags.
      expect(findUniqueCalledInsideTx).toBe(true);
      expect(findUniqueCalledOutsideTx).toBe(false);

      // Exactly one $transaction call for the whole PATCH, with
      // Serializable isolation requested.
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      const [_callback, options] = mockPrisma.$transaction.mock.calls[0] as [
        unknown,
        { isolationLevel?: string } | undefined,
      ];
      expect(options?.isolationLevel).toBe("Serializable");
    });
    it("rejects non-integer string with 400 VALIDATION_ERROR", async () => {
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ defaultScheduleId: "not-a-number" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.message).toMatch(/defaultScheduleId/);
    });
  });

  describe("prisma error branches", () => {
    it("P2002 on email → 409 EMAIL_TAKEN", async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["email"] } }),
      );
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ email: "a@b.com" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("EMAIL_TAKEN");
    });
    it("P2002 on username → 409 USERNAME_TAKEN", async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["username"] } }),
      );
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ username: "taken" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("USERNAME_TAKEN");
    });
    it("P2025 → 404 NOT_FOUND", async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error("not found"), { code: "P2025" }),
      );
      const res = await request(makeApp())
        .patch("/api/admin/users/9999")
        .set("x-admin-key", KEY)
        .send({ name: "New" });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });
    it("P2034 → 503 SERIALIZATION_FAILURE with Retry-After", async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error("serialization"), { code: "P2034" }),
      );
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ name: "New" });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("SERIALIZATION_FAILURE");
      expect(res.headers["retry-after"]).toBe("1");
    });
  });

  describe("happy path", () => {
    it("updates all 5 fields and returns the new state", async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 5 });
      mockPrisma.user.update.mockResolvedValue({
        id: 1, email: "new@x.com", name: "New Name", username: "new", timeZone: "Europe/London", defaultScheduleId: 5,
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({
          email: "new@x.com",
          name: "New Name",
          username: "new",
          timeZone: "Europe/London",
          defaultScheduleId: 5,
        });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: "new@x.com",
        name: "New Name",
        username: "new",
        timeZone: "Europe/London",
        defaultScheduleId: 5,
      });
    });
    it("accepts partial update with just one field", async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 1, email: "a@b.com", name: "Just Name", username: "a", timeZone: "UTC", defaultScheduleId: null,
      });
      const res = await request(makeApp())
        .patch("/api/admin/users/1")
        .set("x-admin-key", KEY)
        .send({ name: "Just Name" });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Just Name");
    });
  });
});
