// apps/booking-app/tests/routes/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

describe("rate limiter (inline fresh instance)", () => {
  it("blocks the 11th request in a 10/min window with 429", async () => {
    const app = express();
    // Fresh limiter per test — no shared state with phase 5a's singleton.
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { status: "error", code: "RATE_LIMITED", message: "slow down" },
    });
    app.use(limiter);
    app.get("/", (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });
});
