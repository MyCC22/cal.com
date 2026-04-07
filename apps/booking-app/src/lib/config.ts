// apps/booking-app/src/lib/config.ts
const REQUIRED_KEYS = ["API_PUBLIC_KEY", "API_ADMIN_KEY"] as const;

/**
 * Returns true if we should treat this process as production. Defaults to
 * production if NODE_ENV is unset, so an unset env var can NEVER silently
 * disable auth. Only an explicit "development" or "test" enables the dev
 * fallback path in auth.ts.
 */
export function isProduction(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "development" && env !== "test";
}

export function validateConfig(): void {
  const missing = REQUIRED_KEYS.filter((k) => !process.env[k]);
  if (missing.length === 0) return;

  const msg = `[config] Missing required env vars: ${missing.join(", ")}`;
  if (isProduction()) {
    // eslint-disable-next-line no-console
    console.error(msg);
    // eslint-disable-next-line no-console
    console.error("[config] Refusing to start in production without authentication keys");
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.warn(msg);
  // eslint-disable-next-line no-console
  console.warn("[config] Running in dev fallback (auth disabled). DO NOT use this in production.");
}
