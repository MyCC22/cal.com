// apps/booking-app/src/routes/slots.ts
import { Router } from "express";
import { getAvailableSlots } from "../services/slots";
import { errorResponse, parseId, internalError } from "../lib/errors";

export const slotsRouter = Router();

slotsRouter.get("/", async (req, res) => {
  try {
    const eventTypeId = parseId(req.query.eventTypeId as string);
    if (eventTypeId === null)
      return errorResponse(res, 400, "VALIDATION_ERROR", "eventTypeId must be a positive integer");

    const start = req.query.start as string;
    const end = req.query.end as string;
    const timeZone = req.query.timeZone as string;

    let duration: number | undefined;
    if (req.query.duration !== undefined) {
      const d = parseId(req.query.duration as string);
      if (d === null)
        return errorResponse(res, 400, "VALIDATION_ERROR", "duration must be a positive integer");
      duration = d;
    }

    if (!start || !end || !timeZone)
      return errorResponse(res, 400, "VALIDATION_ERROR", "start, end, and timeZone are required");

    const slots = await getAvailableSlots({ eventTypeId, start, end, timeZone, duration });
    res.json({ status: "success", data: slots });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not found"))
      return errorResponse(res, 404, "NOT_FOUND", "Event type or host not found");
    return internalError(req, res, error);
  }
});
