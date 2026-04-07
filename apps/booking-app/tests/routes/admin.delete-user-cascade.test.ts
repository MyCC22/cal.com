// apps/booking-app/tests/routes/admin.delete-user-cascade.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp";
import { mockPrisma } from "../setup";

const KEY = "test-admin-key";

describe("DELETE /api/admin/users/:id", () => {
  describe("default path (no ?cascade)", () => {
    it("deletes user with 0 dependencies and returns cascaded:false", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.count.mockResolvedValue(0);
      mockPrisma.schedule.count.mockResolvedValue(0);
      mockPrisma.eventType.count.mockResolvedValue(0);
      mockPrisma.host.count.mockResolvedValue(0);
      mockPrisma.user.delete.mockResolvedValue({ id: 1 });

      const res = await request(makeApp())
        .delete("/api/admin/users/1")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true, id: 1, cascaded: false });
    });
    it("returns 409 HAS_DEPENDENCIES when the user has bookings", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.count.mockResolvedValue(3);
      mockPrisma.schedule.count.mockResolvedValue(0);
      mockPrisma.eventType.count.mockResolvedValue(0);
      mockPrisma.host.count.mockResolvedValue(0);

      const res = await request(makeApp())
        .delete("/api/admin/users/1")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("HAS_DEPENDENCIES");
      expect(res.body.blockers.bookings).toBe(3);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("?cascade=true path", () => {
    it("calls updateMany + deleteMany in correct order then user.delete", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.user.update.mockResolvedValue({ id: 1, defaultScheduleId: null });
      mockPrisma.eventType.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.schedule.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.host.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.delete.mockResolvedValue({ id: 1 });

      const res = await request(makeApp())
        .delete("/api/admin/users/1?cascade=true")
        .set("x-admin-key", KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true, id: 1, cascaded: true });

      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, status: { not: "CANCELLED" } },
        data: expect.objectContaining({ status: "CANCELLED" }),
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { defaultScheduleId: null },
      });
      expect(mockPrisma.eventType.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockPrisma.schedule.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockPrisma.host.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      // Default-path count checks must NOT have run
      expect(mockPrisma.booking.count).not.toHaveBeenCalled();
      expect(mockPrisma.schedule.count).not.toHaveBeenCalled();
    });
    it("cascade succeeds when the user has 0 of anything (no-op deleteMany)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.update.mockResolvedValue({ id: 1, defaultScheduleId: null });
      mockPrisma.eventType.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.schedule.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.host.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.delete.mockResolvedValue({ id: 1 });

      const res = await request(makeApp())
        .delete("/api/admin/users/1?cascade=true")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(200);
      expect(res.body.data.cascaded).toBe(true);
    });
    it("returns 500 via internalError when a mid-cascade step throws", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.update.mockResolvedValue({ id: 1, defaultScheduleId: null });
      mockPrisma.eventType.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.schedule.deleteMany.mockRejectedValue(new Error("FK violation"));

      const res = await request(makeApp())
        .delete("/api/admin/users/1?cascade=true")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("INTERNAL_ERROR");
      expect(res.body.requestId).toBeDefined();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("cascade query parameter edge cases", () => {
    it("?cascade=false falls back to default path", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.count.mockResolvedValue(0);
      mockPrisma.schedule.count.mockResolvedValue(0);
      mockPrisma.eventType.count.mockResolvedValue(0);
      mockPrisma.host.count.mockResolvedValue(0);
      mockPrisma.user.delete.mockResolvedValue({ id: 1 });

      const res = await request(makeApp())
        .delete("/api/admin/users/1?cascade=false")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(200);
      expect(res.body.data.cascaded).toBe(false);
      expect(mockPrisma.booking.count).toHaveBeenCalled();
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    });
    it("?cascade=true&cascade=false (array) uses first value → cascade ON", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.update.mockResolvedValue({ id: 1, defaultScheduleId: null });
      mockPrisma.eventType.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.schedule.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.host.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.delete.mockResolvedValue({ id: 1 });

      const res = await request(makeApp())
        .delete("/api/admin/users/1?cascade=true&cascade=false")
        .set("x-admin-key", KEY);
      expect(res.status).toBe(200);
      expect(res.body.data.cascaded).toBe(true);
    });
  });
});
