# ─────────────────────────────────────────────
# Stage 1: Build the React/Vite app
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Declare build args so Docker passes them into the build layer.
# Vite reads these as import.meta.env.VITE_* and bakes them into the bundle.
ARG VITE_AWS_REGION
ARG VITE_HARNESS_ARN
ARG VITE_RUNTIME_ARN
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_COGNITO_DOMAIN
ARG VITE_COGNITO_REGION
ARG VITE_GATEWAY_ENDPOINT

ENV VITE_AWS_REGION=$VITE_AWS_REGION
ENV VITE_HARNESS_ARN=$VITE_HARNESS_ARN
ENV VITE_RUNTIME_ARN=$VITE_RUNTIME_ARN
ENV VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID
ENV VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID
ENV VITE_COGNITO_DOMAIN=$VITE_COGNITO_DOMAIN
ENV VITE_COGNITO_REGION=$VITE_COGNITO_REGION
ENV VITE_GATEWAY_ENDPOINT=$VITE_GATEWAY_ENDPOINT

# Build. VITE_* env vars are baked in at build time IF provided;
# for dynamic config, they can also be injected at runtime via the
# server.mjs approach (see server.mjs for the /health endpoint).
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Production image
#
# Uses the same Node Alpine base — no nginx needed because
# server.mjs serves static files and handles SPA routing.
# ARM64 (Graviton) compatible.
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --chown=appuser:appgroup server.mjs                       ./server.mjs

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck matching the ECS definition
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.mjs"]
