import dayjs from "@calcom/dayjs";
import type { Dayjs } from "@calcom/dayjs";
import getSlots from "@calcom/features/schedules/lib/slots";
import { buildDateRanges } from "@calcom/features/schedules/lib/date-ranges";
import type { WorkingHours } from "@calcom/features/schedules/lib/date-ranges";
import prisma from "../lib/prisma";

interface GetAvailableSlotsInput {
  eventTypeId: number;
  start: string; // ISO date
  end: string;   // ISO date
  timeZone: string;
  duration?: number;
}

export async function getAvailableSlots(input: GetAvailableSlotsInput) {
  const { eventTypeId, start, end, timeZone, duration } = input;

  // 1. Fetch event type with host
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    select: {
      id: true,
      length: true,
      hosts: {
        select: { userId: true },
        where: { isFixed: true },
      },
      userId: true,
    },
  });

  if (!eventType) {
    throw new Error("Event type not found");
  }

  const hostUserId = eventType.hosts[0]?.userId || eventType.userId;
  if (!hostUserId) {
    throw new Error("No host found for event type");
  }

  const slotDuration = duration || eventType.length;

  // 2. Fetch user's schedule + availability
  const user = await prisma.user.findUnique({
    where: { id: hostUserId },
    select: {
      id: true,
      timeZone: true,
      defaultScheduleId: true,
    },
  });

  if (!user) {
    throw new Error("Host user not found");
  }

  const schedule = await prisma.schedule.findFirst({
    where: user.defaultScheduleId
      ? { id: user.defaultScheduleId }
      : { userId: hostUserId },
    include: {
      availability: true,
    },
  });

  if (!schedule || !schedule.availability.length) {
    return {}; // No schedule = no available slots
  }

  const scheduleTimeZone = schedule.timeZone || user.timeZone || "UTC";

  // 3. Convert availability records to WorkingHours format
  const workingHours: WorkingHours[] = schedule.availability.map((a) => ({
    days: a.days,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  // 4. Fetch existing bookings in the date range (busy times)
  const dateFrom = dayjs(start).tz(timeZone).startOf("day");
  const dateTo = dayjs(end).tz(timeZone).endOf("day");

  const existingBookings = await prisma.booking.findMany({
    where: {
      userId: hostUserId,
      eventTypeId,
      startTime: { gte: dateFrom.toDate() },
      endTime: { lte: dateTo.toDate() },
      status: { in: ["ACCEPTED", "PENDING"] },
    },
    select: { startTime: true, endTime: true },
  });

  // 5. Build date ranges from availability
  const { dateRanges } = buildDateRanges({
    availability: workingHours,
    timeZone: scheduleTimeZone,
    dateFrom,
    dateTo,
    travelSchedules: [],
  });

  // 6. Generate slots
  const slots = getSlots({
    inviteeDate: dateFrom,
    frequency: slotDuration,
    dateRanges,
    minimumBookingNotice: 0,
    eventLength: slotDuration,
  });

  // 7. Filter out busy slots
  const availableSlots = slots.filter((slot) => {
    const slotStart = slot.time;
    const slotEnd = slotStart.add(slotDuration, "minute");

    return !existingBookings.some((booking) => {
      const bookingStart = dayjs(booking.startTime);
      const bookingEnd = dayjs(booking.endTime);
      return slotStart.isBefore(bookingEnd) && slotEnd.isAfter(bookingStart);
    });
  });

  // 8. Group by date
  const grouped: Record<string, { start: string }[]> = {};
  for (const slot of availableSlots) {
    if (slot.away) continue;
    const dateKey = slot.time.tz(timeZone).format("YYYY-MM-DD");
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push({
      start: slot.time.tz(timeZone).toISOString(),
    });
  }

  return grouped;
}
