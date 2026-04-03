// apps/booking-app/src/routes/admin.ts
import { Router } from "express";
import prisma from "../lib/prisma";

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
