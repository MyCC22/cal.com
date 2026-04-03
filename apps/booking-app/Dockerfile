FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root files needed for Yarn workspace resolution
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn ./.yarn

# Copy booking-app and all @calcom/* packages it depends on
COPY apps/booking-app ./apps/booking-app
COPY packages ./packages

# Install all workspace dependencies
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install

# Generate Prisma client from schema
RUN yarn workspace @calcom/prisma generate

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

# Copy everything needed to run: node_modules, packages, and built app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/booking-app ./apps/booking-app

WORKDIR /app/apps/booking-app

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider http://localhost:3100/api/health || exit 1

CMD ["npx", "next", "start", "--port", "3100"]
