// apps/booking-app/src/server.ts
import express from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health";
import { probeRouter } from "./routes/probe";
import { adminRouter } from "./routes/admin";
import { slotsRouter } from "./routes/slots";
import { bookingsRouter } from "./routes/bookings";
import { requirePublicKey, requireAdminKey } from "./middleware/auth";
import { corsMiddleware } from "./middleware/cors";
import { requestIdMiddleware } from "./middleware/requestId";
import { globalRateLimit, writeRateLimit } from "./middleware/rateLimit";
import { validateConfig } from "./lib/config";
import { errorResponse, internalError } from "./lib/errors";

validateConfig(); // exits process in prod if keys missing

const app = express();
const port = parseInt(process.env.PORT || "3100", 10);

// Railway runs behind multiple proxy hops (edge → router → app). Setting
// trust proxy to a single hop count leaves req.ip pointing at one of the
// rotating router IPs, which makes rate limiting useless. Trust all proxies
// so express picks the leftmost X-Forwarded-For value (the real client).
app.set("trust proxy", true);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));
app.use(requestIdMiddleware);
app.use(express.json({ limit: "16kb" }));
app.use(corsMiddleware);
app.use(globalRateLimit); // skips OPTIONS, /api/health, /api/probe

app.use("/api/health", healthRouter);                          // unauth, unrate-limited
app.use("/api/probe", requireAdminKey, probeRouter);           // H5: newly gated
app.use("/api/admin", requireAdminKey, writeRateLimit, adminRouter);
app.use("/api/v1/slots", requirePublicKey, slotsRouter);
app.use("/api/v1/bookings", requirePublicKey, writeRateLimit, bookingsRouter);

// JSON error-handling middleware (REQUIRED — see spec §9c).
// Must come after all routes, before the catch-all 404.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type === "entity.too.large") {
    return errorResponse(res, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds 16kb limit");
  }
  if (err instanceof SyntaxError && "body" in err) {
    return errorResponse(res, 400, "VALIDATION_ERROR", "Invalid JSON in request body");
  }
  return internalError(req, res, err);
});

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Route not found" });
});

app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`> Booking App ready on http://0.0.0.0:${port}`);
});
