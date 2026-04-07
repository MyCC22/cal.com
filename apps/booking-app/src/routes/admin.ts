// apps/booking-app/src/routes/admin.ts
import { Router } from "express";
import prisma from "../lib/prisma";
import { errorResponse, parseId, uniqueViolationCode, isSerializationFailure } from "../lib/errors";

export const adminRouter = Router();

// --- Users ---

adminRouter.post("/users", async (req, res) => {
  try {
    const { email, name, timeZone } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "email and name are required",
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        username: email.split("@")[0],
        timeZone: timeZone || "America/Los_Angeles",
        completedOnboarding: true,
      },
      select: { id: true, email: true, name: true, username: true, timeZone: true },
    });

    res.json({ status: "success", data: user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.get("/users", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, username: true, timeZone: true },
      orderBy: { id: "asc" },
    });
    res.json({ status: "success", data: users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.patch("/users/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { email, name, timeZone, username } = req.body || {};
  const data: Record<string, unknown> = {};
  if (email !== undefined) data.email = email;
  if (name !== undefined) data.name = name;
  if (timeZone !== undefined) data.timeZone = timeZone;
  if (username !== undefined) data.username = username;

  if (Object.keys(data).length === 0) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "at least one field is required");
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, username: true, timeZone: true },
    });
    res.json({ status: "success", data: user });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const code = uniqueViolationCode(error);
    if (code === "EMAIL_TAKEN") return errorResponse(res, 409, "EMAIL_TAKEN", "email already in use");
    if (code === "USERNAME_TAKEN") return errorResponse(res, 409, "USERNAME_TAKEN", "username already in use");
    const e = error as { code?: string; message?: string };
    if (e.code === "P2025") return errorResponse(res, 404, "NOT_FOUND", "user not found");
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});

// ⚠️ Load-bearing: cal.com schema declares Booking.user as onDelete: Cascade.
// Without this dependency check, deleting a user silently erases ALL their
// booking history (including completed and cancelled). Do not remove.
adminRouter.delete("/users/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return { notFound: true as const };

      // NOTE: We also count Host rows where userId = :id. Today this is
      // covered transitively by `eventTypes` (POST /event-types only creates
      // self-hosts), but checking explicitly future-proofs against any
      // future code path that lets a user be a host on event types they
      // don't own.
      const [bookings, schedules, eventTypes, hosts] = await Promise.all([
        tx.booking.count({ where: { userId: id, status: { not: "CANCELLED" } } }),
        tx.schedule.count({ where: { userId: id } }),
        tx.eventType.count({ where: { userId: id } }),
        tx.host.count({ where: { userId: id } }),
      ]);

      if (bookings + schedules + eventTypes + hosts > 0) {
        return { blockers: { bookings, schedules, eventTypes, hosts } };
      }

      await tx.user.delete({ where: { id } });
      return { deleted: true as const };
    }, { isolationLevel: "Serializable" });

    if ("notFound" in result) return errorResponse(res, 404, "NOT_FOUND", "user not found");
    if ("blockers" in result) {
      return errorResponse(res, 409, "HAS_DEPENDENCIES",
        "Cannot delete user with active dependencies", { blockers: result.blockers });
    }
    res.json({ status: "success", data: { deleted: true, id } });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const e = error as { message?: string };
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});

// --- Schedules ---

adminRouter.post("/schedules", async (req, res) => {
  try {
    const { userId, name, timeZone, availability } = req.body;

    if (!userId || !name || !availability?.length) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "userId, name, and availability are required",
      });
    }

    const schedule = await prisma.$transaction(async (tx) => {
      const s = await tx.schedule.create({
        data: {
          userId,
          name,
          timeZone: timeZone || "America/Los_Angeles",
          availability: {
            create: availability.map((a: { days: number[]; startTime: string; endTime: string }) => ({
              days: a.days,
              startTime: new Date(`1970-01-01T${a.startTime}:00.000Z`),
              endTime: new Date(`1970-01-01T${a.endTime}:00.000Z`),
            })),
          },
        },
        include: { availability: true },
      });

      // Set as user's default schedule (atomic with creation)
      await tx.user.update({
        where: { id: userId },
        data: { defaultScheduleId: s.id },
      });

      return s;
    });

    res.json({ status: "success", data: { id: schedule.id, name: schedule.name, timeZone: schedule.timeZone } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.get("/schedules", async (_req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      select: {
        id: true, name: true, timeZone: true, userId: true,
        availability: { select: { days: true, startTime: true, endTime: true } },
      },
      orderBy: { id: "asc" },
    });
    res.json({ status: "success", data: schedules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.patch("/schedules/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { name, timeZone, availability } = req.body || {};
  if (name === undefined && timeZone === undefined && availability === undefined) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "at least one field is required");
  }

  try {
    const schedule = await prisma.$transaction(async (tx) => {
      const existing = await tx.schedule.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return null;

      const meta: Record<string, unknown> = {};
      if (name !== undefined) meta.name = name;
      if (timeZone !== undefined) meta.timeZone = timeZone;
      if (Object.keys(meta).length > 0) {
        await tx.schedule.update({ where: { id }, data: meta });
      }

      if (Array.isArray(availability)) {
        await tx.availability.deleteMany({ where: { scheduleId: id } });
        if (availability.length > 0) {
          await tx.availability.createMany({
            data: availability.map((a: { days: number[]; startTime: string; endTime: string }) => ({
              scheduleId: id,
              days: a.days,
              startTime: new Date(`1970-01-01T${a.startTime}:00.000Z`),
              endTime: new Date(`1970-01-01T${a.endTime}:00.000Z`),
            })),
          });
        }
      }

      return tx.schedule.findUnique({
        where: { id },
        select: {
          id: true, name: true, timeZone: true, userId: true,
          availability: { select: { days: true, startTime: true, endTime: true } },
        },
      });
    }, { isolationLevel: "Serializable" });

    if (!schedule) return errorResponse(res, 404, "NOT_FOUND", "schedule not found");
    res.json({ status: "success", data: schedule });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const e = error as { message?: string };
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});

adminRouter.delete("/schedules/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.findUnique({ where: { id }, select: { id: true } });
      if (!schedule) return { notFound: true as const };

      const defaultForUsers = await tx.user.count({ where: { defaultScheduleId: id } });
      if (defaultForUsers > 0) {
        return { blockers: { defaultForUsers } };
      }

      await tx.schedule.delete({ where: { id } });
      return { deleted: true as const };
    }, { isolationLevel: "Serializable" });

    if ("notFound" in result) return errorResponse(res, 404, "NOT_FOUND", "schedule not found");
    if ("blockers" in result) {
      return errorResponse(res, 409, "HAS_DEPENDENCIES",
        "Cannot delete schedule that is a user's default", { blockers: result.blockers });
    }
    res.json({ status: "success", data: { deleted: true, id } });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const e = error as { message?: string };
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});

// --- Event Types ---

adminRouter.post("/event-types", async (req, res) => {
  try {
    const { title, slug, length, userId } = req.body;

    if (!title || !slug || !length || !userId) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "title, slug, length, and userId are required",
      });
    }

    const eventType = await prisma.eventType.create({
      data: {
        title,
        slug,
        length,
        userId,
        hosts: {
          create: { userId, isFixed: true },
        },
      },
      select: { id: true, title: true, slug: true, length: true, userId: true },
    });

    res.json({ status: "success", data: eventType });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.get("/event-types", async (_req, res) => {
  try {
    const eventTypes = await prisma.eventType.findMany({
      select: {
        id: true, title: true, slug: true, length: true, userId: true,
        hosts: { select: { userId: true, isFixed: true } },
      },
      orderBy: { id: "asc" },
    });
    res.json({ status: "success", data: eventTypes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

adminRouter.patch("/event-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { title, slug, length } = req.body || {};
  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (slug !== undefined) data.slug = slug;
  if (length !== undefined) data.length = length;

  if (Object.keys(data).length === 0) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "at least one field is required");
  }

  try {
    const eventType = await prisma.eventType.update({
      where: { id },
      data,
      select: { id: true, title: true, slug: true, length: true, userId: true },
    });
    res.json({ status: "success", data: eventType });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const code = uniqueViolationCode(error);
    if (code === "SLUG_TAKEN") return errorResponse(res, 409, "SLUG_TAKEN", "slug already in use for this user");
    const e = error as { code?: string; message?: string };
    if (e.code === "P2025") return errorResponse(res, 404, "NOT_FOUND", "event type not found");
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});

// ⚠️ Load-bearing: cal.com schema declares Booking.eventType as onDelete: Cascade.
// Without this guard, deleting an event type silently erases every booking made
// against it. Do not remove.
adminRouter.delete("/event-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const eventType = await tx.eventType.findUnique({ where: { id }, select: { id: true } });
      if (!eventType) return { notFound: true as const };

      const bookings = await tx.booking.count({
        where: { eventTypeId: id, status: { not: "CANCELLED" } },
      });

      if (bookings > 0) return { blockers: { bookings } };

      await tx.eventType.delete({ where: { id } });
      return { deleted: true as const };
    }, { isolationLevel: "Serializable" });

    if ("notFound" in result) return errorResponse(res, 404, "NOT_FOUND", "event type not found");
    if ("blockers" in result) {
      return errorResponse(res, 409, "HAS_DEPENDENCIES",
        "Cannot delete event type with active bookings", { blockers: result.blockers });
    }
    res.json({ status: "success", data: { deleted: true, id } });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    const e = error as { message?: string };
    return errorResponse(res, 500, "INTERNAL_ERROR", e.message || "unknown error");
  }
});
