// apps/booking-app/tests/routes/middleware.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp";

describe("health endpoint", () => {
  it("returns 200 without auth", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
