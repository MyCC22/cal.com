// apps/booking-app/tests/helpers/makeApp.ts
import express from "express";
import { healthRouter } from "../../src/routes/health";
import { probeRouter } from "../../src/routes/probe";
import { adminRouter } from "../../src/routes/admin";
import { slotsRouter } from "../../src/routes/slots";
import { bookingsRouter } from "../../src/routes/bookings";
import { requirePublicKey, requireAdminKey } from "../../src/middleware/auth";
import { corsMiddleware } from "../../src/middleware/cors";
import { requestIdMiddleware } from "../../src/middleware/requestId";
import { errorResponse, internalError } from "../../src/lib/errors";

/**
 * Builds an Express app mirroring src/server.ts, MINUS the global and
 * write rate limiters. The rate limiter uses module-level in-memory
 * state (MemoryStore) that would bleed between tests and fight per-test
 * mock resets. The dedicated `tests/routes/rate-limit.test.ts` file
 * constructs a fresh limiter inline.
 *
 * Call this inside each test (or beforeEach) so each test gets a fresh
 * Express instance — no shared middleware state.
 */
export function makeApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "16kb" }));
  app.use(corsMiddleware);

  app.use("/api/health", healthRouter);
  app.use("/api/probe", requireAdminKey, probeRouter);
  app.use("/api/admin", requireAdminKey, adminRouter);
  app.use("/api/v1/slots", requirePublicKey, slotsRouter);
  app.use("/api/v1/bookings", requirePublicKey, bookingsRouter);

  // JSON error middleware (mirrors server.ts)
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type === "entity.too.large") {
      return errorResponse(res, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds 16kb limit");
    }
    if (err instanceof SyntaxError && "body" in err) {
      return errorResponse(res, 400, "VALIDATION_ERROR", "Invalid JSON in request body");
    }
    return internalError(req, res, err);
  });

  app.use((_req, res) => {
    res.status(404).json({ status: "error", code: "NOT_FOUND", message: "Route not found" });
  });

  return app;
}
