// apps/booking-app/src/routes/admin.ts
import { Router } from "express";
import prisma from "../lib/prisma";
import { errorResponse, parseId, uniqueViolationCode, isSerializationFailure, isNonEmptyString, isPositiveInt, internalError, withinMaxLength, FIELD_LIMITS, isValidEmail, isValidAvailabilityWindow } from "../lib/errors";

export const adminRouter = Router();

// --- Users ---

adminRouter.post("/users", async (req, res) => {
  const { email, name, timeZone } = req.body || {};

  if (!isNonEmptyString(email) || !withinMaxLength(email, FIELD_LIMITS.email) || !isValidEmail(email))
    return errorResponse(res, 400, "VALIDATION_ERROR", "email is required (1–320 chars, valid format)");
  if (!isNonEmptyString(name) || !withinMaxLength(name, FIELD_LIMITS.name))
    return errorResponse(res, 400, "VALIDATION_ERROR", "name is required (1–200 chars)");
  if (timeZone !== undefined && (!isNonEmptyString(timeZone) || !withinMaxLength(timeZone, FIELD_LIMITS.timeZone)))
    return errorResponse(res, 400, "VALIDATION_ERROR", "timeZone must be a non-empty string ≤ 64 chars");

  // M6: validate the local part of the email is safe to use as a username
  const localPart = email.split("@")[0];
  if (!/^[a-z0-9._-]+$/i.test(localPart))
    return errorResponse(res, 400, "VALIDATION_ERROR", "email local part must match /^[a-z0-9._-]+$/i");

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        username: localPart,
        timeZone: timeZone || "America/Los_Angeles",
        completedOnboarding: true,
      },
      select: { id: true, email: true, name: true, username: true, timeZone: true },
    });
    res.json({ status: "success", data: user });
  } catch (error: unknown) {
    const code = uniqueViolationCode(error);
    if (code === "EMAIL_TAKEN") return errorResponse(res, 409, "EMAIL_TAKEN", "email already in use");
    if (code === "USERNAME_TAKEN") return errorResponse(res, 409, "USERNAME_TAKEN", "username already in use");
    return internalError(req, res, error);
  }
});

adminRouter.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, username: true, timeZone: true },
      orderBy: { id: "asc" },
    });
    res.json({ status: "success", data: users });
  } catch (error: unknown) {
    return internalError(req, res, error);
  }
});

adminRouter.patch("/users/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { email, name, timeZone, username, defaultScheduleId } = req.body || {};

  // String field validators: length-first then format, so oversized input
  // is rejected in O(1) before any regex runs (avoids ReDoS / CPU DoS).
  if (
    email !== undefined &&
    (!isNonEmptyString(email) || !withinMaxLength(email, FIELD_LIMITS.email) || !isValidEmail(email))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `email must be a valid email (1–${FIELD_LIMITS.email} chars)`);
  }
  if (
    name !== undefined &&
    (!isNonEmptyString(name) || !withinMaxLength(name, FIELD_LIMITS.name))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `name must be a non-empty string ≤ ${FIELD_LIMITS.name} chars`);
  }
  if (
    timeZone !== undefined &&
    (!isNonEmptyString(timeZone) || !withinMaxLength(timeZone, FIELD_LIMITS.timeZone))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `timeZone must be a non-empty string ≤ ${FIELD_LIMITS.timeZone} chars`);
  }
  if (
    username !== undefined &&
    (!isNonEmptyString(username) || !withinMaxLength(username, FIELD_LIMITS.username))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `username must be a non-empty string ≤ ${FIELD_LIMITS.username} chars`);
  }

  // defaultScheduleId: null clears the pointer; a positive integer sets it.
  // cal.com's schema declares `defaultScheduleId Int?` WITHOUT a Prisma
  // @relation, so Postgres has no foreign key constraint and unknown IDs
  // would be silently accepted without an explicit check.
  if (
    defaultScheduleId !== undefined &&
    defaultScheduleId !== null &&
    !isPositiveInt(defaultScheduleId)
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "defaultScheduleId must be a positive integer or null");
  }

  const data: Record<string, unknown> = {};
  if (email !== undefined) data.email = email;
  if (name !== undefined) data.name = name;
  if (timeZone !== undefined) data.timeZone = timeZone;
  if (username !== undefined) data.username = username;
  if (defaultScheduleId !== undefined) data.defaultScheduleId = defaultScheduleId;

  if (Object.keys(data).length === 0) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "at least one field is required");
  }

  try {
    // TOCTOU fix: existence check + update run in the same serializable
    // transaction. Discriminated-union return avoids string-sniffing the
    // error path (matches the pattern used by DELETE /users).
    //
    // This invariant — findUnique running INSIDE the tx — is verified by
    // `tests/routes/admin.patch-users.test.ts > "TOCTOU invariant"`.
    // If that test starts failing, do NOT move the findUnique out; the
    // race it closes is real.
    const result = await prisma.$transaction(async (tx) => {
      if (typeof defaultScheduleId === "number") {
        const exists = await tx.schedule.findUnique({
          where: { id: defaultScheduleId },
          select: { id: true },
        });
        if (!exists) return { invalidRef: true as const };
      }
      const user = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          timeZone: true,
          defaultScheduleId: true,
        },
      });
      return { user };
    }, { isolationLevel: "Serializable" });

    if ("invalidRef" in result) {
      return errorResponse(res, 400, "INVALID_REFERENCE", "defaultScheduleId references an unknown schedule");
    }
    res.json({ status: "success", data: result.user });
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
    // Defense-in-depth: this branch is dead today because cal.com's schema
    // has no FK @relation on User.defaultScheduleId (we check explicitly
    // inside the tx above). Kept intentionally so if a future schema
    // migration adds the relation, FK violations surface as a clean 400
    // instead of a 500.
    if (e.code === "P2003") return errorResponse(res, 400, "INVALID_REFERENCE", "defaultScheduleId references an unknown schedule");
    return internalError(req, res, error);
  }
});

// ⚠️ Load-bearing: cal.com schema declares Booking.user as onDelete: Cascade.
// Without the dependency check below, deleting a user silently erases ALL
// their booking history (including completed and cancelled). The default
// path preserves this guard. The ?cascade=true path is opt-in and
// pre-cancels bookings to keep history as CANCELLED rows before the user
// delete cascades them.
adminRouter.delete("/users/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  // Coerce the cascade query parameter. Express's `qs` parser can return
  // string | string[] | ParsedQs | ParsedQs[] | undefined, so we narrow
  // through a typeof check to stay fail-closed against nested/object
  // forms like `?cascade[key]=true`. Only literal string "true" opts in.
  const rawCascade = req.query.cascade;
  const cascadeStr =
    typeof rawCascade === "string"
      ? rawCascade
      : Array.isArray(rawCascade) && typeof rawCascade[0] === "string"
        ? rawCascade[0]
        : undefined;
  const cascade = cascadeStr === "true";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return { notFound: true as const };

      if (!cascade) {
        // DEFAULT PATH — Host rows counted explicitly as defense-in-depth
        // against any future code that lets a user be a host on event types
        // they don't own (today transitively covered by eventTypes).
        const [bookings, schedules, eventTypes, hosts] = await Promise.all([
          tx.booking.count({ where: { userId: id, status: { not: "CANCELLED" } } }),
          tx.schedule.count({ where: { userId: id } }),
          tx.eventType.count({ where: { userId: id } }),
          tx.host.count({ where: { userId: id } }),
        ]);
        if (bookings + schedules + eventTypes + hosts > 0) {
          return { blockers: { bookings, schedules, eventTypes, hosts } };
        }
      } else {
        // CASCADE PATH — opt-in only. Atomic inside serializable transaction.
        // Order matters: cancel bookings → repoint → delete children → delete user.
        // See phase 5c spec §"C2 — Cascade delete design" for the full rationale.
        await tx.booking.updateMany({
          where: { userId: id, status: { not: "CANCELLED" } },
          data: { status: "CANCELLED", cancellationReason: "user deleted via cascade" },
        });
        await tx.user.update({ where: { id }, data: { defaultScheduleId: null } });
        await tx.eventType.deleteMany({ where: { userId: id } });
        await tx.schedule.deleteMany({ where: { userId: id } });
        await tx.host.deleteMany({ where: { userId: id } });
      }

      await tx.user.delete({ where: { id } });
      return { deleted: true as const };
    }, { isolationLevel: "Serializable" });

    if ("notFound" in result) return errorResponse(res, 404, "NOT_FOUND", "user not found");
    if ("blockers" in result) {
      return errorResponse(res, 409, "HAS_DEPENDENCIES",
        "Cannot delete user with active dependencies", { blockers: result.blockers });
    }
    res.json({ status: "success", data: { deleted: true, id, cascaded: cascade } });
  } catch (error: unknown) {
    if (isSerializationFailure(error)) {
      res.set("Retry-After", "1");
      return errorResponse(res, 503, "SERIALIZATION_FAILURE", "database contention; please retry");
    }
    return internalError(req, res, error);
  }
});

// --- Schedules ---

adminRouter.post("/schedules", async (req, res) => {
  const { userId, name, timeZone, availability } = req.body || {};

  if (!isPositiveInt(userId))
    return errorResponse(res, 400, "VALIDATION_ERROR", "userId must be a positive integer");
  if (!isNonEmptyString(name) || !withinMaxLength(name, FIELD_LIMITS.name))
    return errorResponse(res, 400, "VALIDATION_ERROR", "name is required (1–200 chars)");
  if (timeZone !== undefined && (!isNonEmptyString(timeZone) || !withinMaxLength(timeZone, FIELD_LIMITS.timeZone)))
    return errorResponse(res, 400, "VALIDATION_ERROR", "timeZone must be a non-empty string ≤ 64 chars");
  if (!Array.isArray(availability) || availability.length === 0)
    return errorResponse(res, 400, "VALIDATION_ERROR", "availability must be a non-empty array");
  if (!availability.every(isValidAvailabilityWindow))
    return errorResponse(
      res,
      400,
      "VALIDATION_ERROR",
      "each availability window must have days (int 0-6), startTime HH:MM, endTime HH:MM, and startTime < endTime",
    );

  try {
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
      await tx.user.update({ where: { id: userId }, data: { defaultScheduleId: s.id } });
      return s;
    });
    res.json({ status: "success", data: { id: schedule.id, name: schedule.name, timeZone: schedule.timeZone } });
  } catch (error: unknown) {
    return internalError(req, res, error);
  }
});

adminRouter.get("/schedules", async (req, res) => {
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
    return internalError(req, res, error);
  }
});

adminRouter.patch("/schedules/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { name, timeZone, availability } = req.body || {};
  if (name === undefined && timeZone === undefined && availability === undefined) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "at least one field is required");
  }
  if (
    name !== undefined &&
    (!isNonEmptyString(name) || !withinMaxLength(name, FIELD_LIMITS.name))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `name must be a non-empty string ≤ ${FIELD_LIMITS.name} chars`);
  }
  if (
    timeZone !== undefined &&
    (!isNonEmptyString(timeZone) || !withinMaxLength(timeZone, FIELD_LIMITS.timeZone))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `timeZone must be a non-empty string ≤ ${FIELD_LIMITS.timeZone} chars`);
  }
  if (availability !== undefined) {
    if (!Array.isArray(availability))
      return errorResponse(res, 400, "VALIDATION_ERROR", "availability must be an array");
    if (!availability.every(isValidAvailabilityWindow))
      return errorResponse(
        res,
        400,
        "VALIDATION_ERROR",
        "each availability window must have days (int 0-6), startTime HH:MM, endTime HH:MM, and startTime < endTime",
      );
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
    return internalError(req, res, error);
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
    return internalError(req, res, error);
  }
});

// --- Event Types ---

adminRouter.post("/event-types", async (req, res) => {
  const { title, slug, length, userId } = req.body || {};

  if (!isNonEmptyString(title) || !withinMaxLength(title, FIELD_LIMITS.title))
    return errorResponse(res, 400, "VALIDATION_ERROR", "title is required (1–200 chars)");
  if (!isNonEmptyString(slug) || !withinMaxLength(slug, FIELD_LIMITS.slug))
    return errorResponse(res, 400, "VALIDATION_ERROR", "slug is required (1–200 chars)");
  if (!isPositiveInt(length))
    return errorResponse(res, 400, "VALIDATION_ERROR", "length must be a positive integer");
  if (!isPositiveInt(userId))
    return errorResponse(res, 400, "VALIDATION_ERROR", "userId must be a positive integer");

  try {
    const eventType = await prisma.eventType.create({
      data: {
        title,
        slug,
        length,
        userId,
        hosts: { create: { userId, isFixed: true } },
      },
      select: { id: true, title: true, slug: true, length: true, userId: true },
    });
    res.json({ status: "success", data: eventType });
  } catch (error: unknown) {
    const code = uniqueViolationCode(error);
    if (code === "SLUG_TAKEN") return errorResponse(res, 409, "SLUG_TAKEN", "slug already in use for this user");
    return internalError(req, res, error);
  }
});

adminRouter.get("/event-types", async (req, res) => {
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
    return internalError(req, res, error);
  }
});

adminRouter.patch("/event-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return errorResponse(res, 400, "VALIDATION_ERROR", "id must be a positive integer");

  const { title, slug, length } = req.body || {};

  if (
    title !== undefined &&
    (!isNonEmptyString(title) || !withinMaxLength(title, FIELD_LIMITS.title))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `title must be a non-empty string ≤ ${FIELD_LIMITS.title} chars`);
  }
  if (
    slug !== undefined &&
    (!isNonEmptyString(slug) || !withinMaxLength(slug, FIELD_LIMITS.slug))
  ) {
    return errorResponse(res, 400, "VALIDATION_ERROR", `slug must be a non-empty string ≤ ${FIELD_LIMITS.slug} chars`);
  }
  if (length !== undefined && !isPositiveInt(length))
    return errorResponse(res, 400, "VALIDATION_ERROR", "length must be a positive integer");

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
    return internalError(req, res, error);
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
    return internalError(req, res, error);
  }
});
