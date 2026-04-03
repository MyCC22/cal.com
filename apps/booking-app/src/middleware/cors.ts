// apps/booking-app/src/middleware/cors.ts
import type { Request, Response, NextFunction } from "express";

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origins = process.env.CORS_ORIGINS || "*";
  res.header("Access-Control-Allow-Origin", origins);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}
