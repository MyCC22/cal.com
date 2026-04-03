import { Router } from "express";

export const probeRouter = Router();

// Test @calcom/prisma import + DB connectivity
probeRouter.get("/prisma", async (_req, res) => {
  try {
    const prisma = (await import("@calcom/prisma")).default;

    let dbStatus = "not_connected";
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : "unknown error";
      dbStatus = `connection_failed: ${message}`;
    }

    res.json({ prismaImport: "success", dbStatus });
  } catch (importError: unknown) {
    const message = importError instanceof Error ? importError.message : "unknown error";
    res.status(500).json({ prismaImport: "failed", error: message });
  }
});

// Test @calcom/features DI container imports
probeRouter.get("/features", async (_req, res) => {
  const results: Record<string, string> = {};

  try {
    const { getAvailableSlotsService } = await import(
      "@calcom/features/di/containers/AvailableSlots"
    );
    results.availableSlotsDI =
      typeof getAvailableSlotsService === "function" ? "success" : "wrong_type";
  } catch (e: unknown) {
    results.availableSlotsDI = `failed: ${e instanceof Error ? e.message : "unknown"}`;
  }

  try {
    const mod = await import("@calcom/features/di/containers/GetUserAvailability");
    results.userAvailabilityDI = Object.keys(mod).length > 0 ? "success" : "empty_module";
  } catch (e: unknown) {
    results.userAvailabilityDI = `failed: ${e instanceof Error ? e.message : "unknown"}`;
  }

  try {
    const mod = await import("@calcom/features/schedules/lib/slots");
    results.slotsLib = Object.keys(mod).length > 0 ? "success" : "empty_module";
  } catch (e: unknown) {
    results.slotsLib = `failed: ${e instanceof Error ? e.message : "unknown"}`;
  }

  const allPassed = Object.values(results).every((v) => v.startsWith("success"));

  res.json({
    overall: allPassed ? "all_passed" : "some_failed",
    results,
  });
});
