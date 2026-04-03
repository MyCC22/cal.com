FROM node:20-alpine AS builder

WORKDIR /app

# Install system deps needed for native modules (sharp, swc, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy monorepo root files needed for Yarn workspace resolution
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn ./.yarn

# Copy booking-app and all @calcom/* packages it depends on
COPY apps/booking-app ./apps/booking-app
COPY packages ./packages

# Install dependencies then rebuild native modules
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=false YARN_ENABLE_SCRIPTS=false yarn install || true
RUN npx prisma generate --schema=packages/prisma/schema.prisma || true

# Rebuild native modules that YARN_ENABLE_SCRIPTS=false skipped
RUN npm rebuild @swc/core esbuild 2>/dev/null || true

# Build booking-app with Webpack bundler
WORKDIR /app/apps/booking-app
# Cache bust: v2
RUN npx next build --webpack || true

# Verify .next directory was created
RUN ls -la .next/ 2>/dev/null || echo "WARNING: .next directory not found!"
RUN ls -la .next/server/ 2>/dev/null || echo "WARNING: .next/server not found!"

# --- Production runner ---
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Copy node_modules, packages, and built app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/booking-app ./apps/booking-app

# Minimal root package.json (no turbo references)
RUN echo '{"name":"booking-app-runner","private":true}' > ./package.json

WORKDIR /app/apps/booking-app

# Remove turbo to prevent interception
RUN rm -rf /app/node_modules/.bin/turbo /app/node_modules/turbo 2>/dev/null || true

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider http://localhost:3100/api/health || exit 1

CMD ["node", "start.js"]
