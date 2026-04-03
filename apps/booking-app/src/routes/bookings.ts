// apps/booking-app/src/routes/bookings.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import dayjs from "@calcom/dayjs";
import prisma from "../lib/prisma";

export const bookingsRouter = Router();

// POST /api/v1/bookings — Create a booking
bookingsRouter.post("/", async (req, res) => {
  try {
    const { eventTypeId, start, name, email, timeZone, notes } = req.body;

    if (!eventTypeId || !start || !name || !email || !timeZone) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "eventTypeId, start, name, email, and timeZone are required",
      });
    }

    // Fetch event type
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      select: { id: true, title: true, length: true, userId: true },
    });

    if (!eventType) {
      return res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Event type not found" });
    }

    const startTime = dayjs(start).utc().toDate();
    const endTime = dayjs(start).add(eventType.length, "minute").utc().toDate();

    // Race condition protection: serializable transaction with conflict check
    const booking = await prisma.$transaction(async (tx) => {
      // Check for overlapping bookings
      const conflict = await tx.booking.findFirst({
        where: {
          eventTypeId,
          userId: eventType.userId,
          status: { in: ["ACCEPTED", "PENDING"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (conflict) {
        throw new Error("SLOT_NOT_AVAILABLE");
      }

      // Create booking
      const uid = uuidv4();
      return tx.booking.create({
        data: {
          uid,
          title: `${eventType.title} with ${name}`,
          startTime,
          endTime,
          eventTypeId,
          userId: eventType.userId,
          status: "ACCEPTED",
          responses: { name, email, notes: notes || "" },
          attendees: {
            create: {
              email,
              name,
              timeZone,
            },
          },
        },
        select: {
          uid: true,
          startTime: true,
          endTime: true,
          status: true,
          title: true,
          attendees: { select: { name: true, email: true, timeZone: true } },
        },
      });
    }, { isolationLevel: 'Serializable' });

    res.json({ status: "success", data: booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message === "SLOT_NOT_AVAILABLE") {
      return res.status(409).json({
        status: "error",
        code: "SLOT_NOT_AVAILABLE",
        message: "The requested time slot is no longer available",
      });
    }
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

// GET /api/v1/bookings/:uid — Get booking details
bookingsRouter.get("/:uid", async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { uid: req.params.uid },
      select: {
        uid: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        cancellationReason: true,
        attendees: { select: { name: true, email: true, timeZone: true } },
        eventType: { select: { id: true, title: true, length: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Booking not found" });
    }

    res.json({ status: "success", data: booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

// POST /api/v1/bookings/:uid/cancel — Cancel a booking
bookingsRouter.post("/:uid/cancel", async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { uid: req.params.uid },
      select: { id: true, status: true },
    });

    if (!booking) {
      return res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Booking not found" });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({ status: "error", code: "VALIDATION_ERROR", message: "Booking is already cancelled" });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancellationReason: req.body.reason || null,
      },
      select: { uid: true, status: true, cancellationReason: true },
    });

    res.json({ status: "success", data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});

// POST /api/v1/bookings/:uid/reschedule — Reschedule a booking
bookingsRouter.post("/:uid/reschedule", async (req, res) => {
  try {
    const { start, timeZone } = req.body;

    if (!start || !timeZone) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "start and timeZone are required",
      });
    }

    const oldBooking = await prisma.booking.findUnique({
      where: { uid: req.params.uid },
      select: {
        id: true, uid: true, eventTypeId: true, userId: true, title: true, status: true,
        eventType: { select: { length: true } },
        attendees: { select: { name: true, email: true, timeZone: true } },
      },
    });

    if (!oldBooking || !oldBooking.eventType) {
      return res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Booking not found" });
    }

    if (oldBooking.status === "CANCELLED") {
      return res.status(400).json({ status: "error", code: "VALIDATION_ERROR", message: "Cannot reschedule a cancelled booking" });
    }

    const startTime = dayjs(start).utc().toDate();
    const endTime = dayjs(start).add(oldBooking.eventType.length, "minute").utc().toDate();
    const attendee = oldBooking.attendees[0];

    // Create new booking + cancel old one in a serializable transaction
    const newBooking = await prisma.$transaction(async (tx) => {
      // Check conflicts for new time
      const conflict = await tx.booking.findFirst({
        where: {
          eventTypeId: oldBooking.eventTypeId,
          userId: oldBooking.userId,
          status: { in: ["ACCEPTED", "PENDING"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
          id: { not: oldBooking.id },
        },
      });

      if (conflict) throw new Error("SLOT_NOT_AVAILABLE");

      // Cancel old booking
      await tx.booking.update({
        where: { id: oldBooking.id },
        data: { status: "CANCELLED", rescheduled: true },
      });

      // Create new booking
      const uid = uuidv4();
      return tx.booking.create({
        data: {
          uid,
          title: oldBooking.title,
          startTime,
          endTime,
          eventTypeId: oldBooking.eventTypeId,
          userId: oldBooking.userId,
          status: "ACCEPTED",
          fromReschedule: oldBooking.uid,
          attendees: attendee
            ? { create: { email: attendee.email, name: attendee.name, timeZone: timeZone || attendee.timeZone } }
            : undefined,
        },
        select: {
          uid: true, startTime: true, endTime: true, status: true,
          attendees: { select: { name: true, email: true, timeZone: true } },
        },
      });
    }, { isolationLevel: 'Serializable' });

    res.json({ status: "success", data: newBooking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message === "SLOT_NOT_AVAILABLE") {
      return res.status(409).json({
        status: "error",
        code: "SLOT_NOT_AVAILABLE",
        message: "The requested time slot is no longer available",
      });
    }
    res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message });
  }
});
