import { NextResponse } from "next/server";

export async function GET() {
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

  return NextResponse.json({
    overall: allPassed ? "all_passed" : "some_failed",
    results,
  });
}
