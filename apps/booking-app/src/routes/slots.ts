// apps/booking-app/src/routes/slots.ts
import { Router } from "express";
import { getAvailableSlots } from "../services/slots";

export const slotsRouter = Router();

slotsRouter.get("/", async (req, res) => {
  try {
    const eventTypeId = parseInt(req.query.eventTypeId as string, 10);
    const start = req.query.start as string;
    const end = req.query.end as string;
    const timeZone = req.query.timeZone as string;
    const duration = req.query.duration ? parseInt(req.query.duration as string, 10) : undefined;

    if (!eventTypeId || !start || !end || !timeZone) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "eventTypeId, start, end, and timeZone are required",
      });
    }

    const slots = await getAvailableSlots({ eventTypeId, start, end, timeZone, duration });
    res.json({ status: "success", data: slots });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    const code = message.includes("not found") ? "NOT_FOUND" : "INTERNAL_ERROR";
    const status = code === "NOT_FOUND" ? 404 : 500;
    res.status(status).json({ status: "error", code, message });
  }
});
