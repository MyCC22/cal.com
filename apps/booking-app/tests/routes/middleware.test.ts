// apps/booking-app/tests/routes/middleware.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp";

const ADMIN_KEY = "test-admin-key";

describe("health endpoint", () => {
  it("returns 200 without auth", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("admin auth", () => {
  it("rejects missing x-admin-key with 401", async () => {
    const res = await request(makeApp()).get("/api/admin/users");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
  it("rejects wrong x-admin-key with 401", async () => {
    const res = await request(makeApp())
      .get("/api/admin/users")
      .set("x-admin-key", "wrong");
    expect(res.status).toBe(401);
  });
  it("rejects oversized x-admin-key (>256 chars) with 401", async () => {
    const oversized = "x".repeat(500);
    const res = await request(makeApp())
      .get("/api/admin/users")
      .set("x-admin-key", oversized);
    expect(res.status).toBe(401);
  });
  it("coerces duplicate x-admin-key headers (wrong first value → 401)", async () => {
    // supertest + Node's http layer joins duplicate headers with ", ".
    // Our readKey() reads the combined string, which doesn't match the
    // real key, so auth fails with 401.
    const res = await request(makeApp())
      .get("/api/admin/users")
      .set("x-admin-key", ["wrong", "test-admin-key"]);
    expect(res.status).toBe(401);
  });
});

describe("public auth", () => {
  it("rejects missing x-api-key on /api/v1/slots with 401", async () => {
    const res = await request(makeApp()).get(
      "/api/v1/slots?eventTypeId=1&start=2026-04-10&end=2026-04-11&timeZone=UTC",
    );
    expect(res.status).toBe(401);
  });
});

describe("CORS", () => {
  it("reflects allow-listed origin + Vary: Origin", async () => {
    const res = await request(makeApp())
      .get("/api/health")
      .set("Origin", "http://test");
    expect(res.headers["access-control-allow-origin"]).toBe("http://test");
    expect(res.headers["vary"]).toBe("Origin");
  });
  it("omits Access-Control-Allow-Origin for non-allowed origin", async () => {
    const res = await request(makeApp())
      .get("/api/health")
      .set("Origin", "https://evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["vary"]).toBe("Origin");
  });
  it("OPTIONS preflight returns 204", async () => {
    const res = await request(makeApp())
      .options("/api/admin/users")
      .set("Origin", "http://test")
      .set("Access-Control-Request-Method", "PATCH");
    expect(res.status).toBe(204);
  });
});

describe("request id", () => {
  it("sets X-Request-Id header on every response", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("probe gating", () => {
  it("rejects /api/probe without admin key", async () => {
    const res = await request(makeApp()).get("/api/probe/prisma");
    expect(res.status).toBe(401);
  });
});
