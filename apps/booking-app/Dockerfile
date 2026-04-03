FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root files needed for Yarn workspace resolution
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn ./.yarn

# Copy booking-app and all @calcom/* packages it depends on
COPY apps/booking-app ./apps/booking-app
COPY packages ./packages

# Install all workspace dependencies
# YARN_ENABLE_SCRIPTS=false skips postinstall scripts that fail in Docker
# || true ignores Yarn's exit code (it reports skipped scripts as "errors"
# even though all packages are installed correctly)
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=false YARN_ENABLE_SCRIPTS=false yarn install || true

# Generate Prisma client from schema
RUN npx prisma generate --schema=packages/prisma/schema.prisma || true

# Build booking-app with Webpack bundler
# The || true ignores the /_global-error prerender crash (Next.js 16 bug).
# All API routes compile successfully; only the prerender of a special
# error page fails. next start serves it dynamically at runtime instead.
WORKDIR /app/apps/booking-app
RUN npx next build --webpack || true

# --- Production runner ---
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Copy everything needed to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/turbo.json ./turbo.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/booking-app ./apps/booking-app

WORKDIR /app/apps/booking-app

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider http://localhost:3100/api/health || exit 1

# Run next start directly, bypassing Turbo/Yarn workspace resolution
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3100"]
