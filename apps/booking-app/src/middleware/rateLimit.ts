// apps/booking-app/src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";
import type { Request } from "express";

const skipHealthAndProbe = (req: Request) =>
  req.method === "OPTIONS" ||
  req.path.startsWith("/api/health") ||
  req.path.startsWith("/api/probe");

export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipHealthAndProbe,
  message: {
    status: "error",
    code: "RATE_LIMITED",
    message: "Too many requests, slow down",
  },
});

export const writeRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS" || req.method === "GET",
  message: {
    status: "error",
    code: "RATE_LIMITED",
    message: "Too many write requests, slow down",
  },
});
