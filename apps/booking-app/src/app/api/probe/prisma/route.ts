import { NextResponse } from "next/server";

export async function GET() {
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

    return NextResponse.json({ prismaImport: "success", dbStatus });
  } catch (importError: unknown) {
    const message = importError instanceof Error ? importError.message : "unknown error";
    return NextResponse.json(
      { prismaImport: "failed", error: message },
      { status: 500 }
    );
  }
}
