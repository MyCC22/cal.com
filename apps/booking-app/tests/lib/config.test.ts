// apps/booking-app/tests/lib/config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isProduction, validateConfig } from "../../src/lib/config";

describe("isProduction", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns true for unset NODE_ENV (fail-safe default)", () => {
    delete process.env.NODE_ENV;
    expect(isProduction()).toBe(true);
  });
  it("returns true for 'production' and unknown values", () => {
    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
    process.env.NODE_ENV = "staging";
    expect(isProduction()).toBe(true);
  });
  it("returns false for 'development' and 'test'", () => {
    process.env.NODE_ENV = "development";
    expect(isProduction()).toBe(false);
    process.env.NODE_ENV = "test";
    expect(isProduction()).toBe(false);
  });
});

describe("validateConfig", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.API_PUBLIC_KEY = "x";
    process.env.API_ADMIN_KEY = "y";
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.API_PUBLIC_KEY = originalEnv.API_PUBLIC_KEY;
    process.env.API_ADMIN_KEY = originalEnv.API_ADMIN_KEY;
  });

  it("is a no-op when both keys are set", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => validateConfig()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
  it("exits the process in production when a key is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.API_PUBLIC_KEY;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => validateConfig()).toThrow("exit 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
  it("warns (does not exit) in dev mode when a key is missing", () => {
    process.env.NODE_ENV = "development";
    delete process.env.API_PUBLIC_KEY;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("should not exit");
    }) as never);
    const warnSpy = vi.spyOn(console, "warn");
    validateConfig();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
