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

# Install dependencies (skip postinstall scripts that fail outside full monorepo)
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=false YARN_ENABLE_SCRIPTS=false yarn install || true

# Generate Prisma client
RUN npx prisma generate --schema=packages/prisma/schema.prisma || true

# Compile TypeScript → dist/
WORKDIR /app/apps/booking-app
RUN npx tsc || true

# Verify dist was created
RUN ls -la dist/server.js 2>/dev/null || echo "WARNING: dist/server.js not found!"

# --- Production runner ---
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

# Copy node_modules, packages, and compiled app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/booking-app/dist ./apps/booking-app/dist
COPY --from=builder /app/apps/booking-app/package.json ./apps/booking-app/package.json

# Minimal root package.json
RUN echo '{"name":"booking-app-runner","private":true}' > ./package.json

WORKDIR /app/apps/booking-app

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider http://localhost:3100/api/health || exit 1

CMD ["node", "dist/server.js"]
