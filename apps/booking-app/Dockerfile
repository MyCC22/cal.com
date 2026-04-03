FROM node:20-alpine AS builder

WORKDIR /app

# Install system deps needed for native modules (prisma, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy monorepo root files needed for Yarn workspace resolution
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn ./.yarn

# Copy booking-app and all @calcom/* packages it depends on
COPY apps/booking-app ./apps/booking-app
COPY packages ./packages

# Install dependencies — || true because YARN_ENABLE_SCRIPTS=false causes
# warnings that Yarn treats as errors, but the install itself succeeds
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=false YARN_ENABLE_SCRIPTS=false yarn install || true

# Prisma client generation is critical — fail the build if this fails
RUN npx prisma generate --schema=packages/prisma/schema.prisma

# --- Production runner ---
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

# Copy node_modules, packages, and source (tsx runs TS directly)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/booking-app ./apps/booking-app

# Minimal root package.json to prevent Yarn workspace interference
RUN echo '{"name":"booking-app-runner","private":true}' > ./package.json

WORKDIR /app/apps/booking-app

EXPOSE 3100

# start-period gives tsx time to transpile @calcom packages on first load
HEALTHCHECK --start-period=60s --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider http://localhost:3100/api/health || exit 1

# Verify tsx exists at the hoisted location (Yarn hoists to root node_modules)
RUN test -f /app/node_modules/.bin/tsx || (echo "ERROR: tsx not found at /app/node_modules/.bin/tsx" && exit 1)

# Use absolute path — Yarn hoists tsx to /app/node_modules, not /app/apps/booking-app/node_modules
CMD ["/app/node_modules/.bin/tsx", "src/server.ts"]
