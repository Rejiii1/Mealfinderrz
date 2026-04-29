# syntax=docker/dockerfile:1.7

# ── Stage 1: prod-only deps (cached until package.json changes) ───────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ── Stage 2: build (no compile step today; reserved for future bundling) ─────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server.js ./server.js
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/*.html ./
COPY --from=build --chown=node:node /app/*.js ./
COPY --from=build --chown=node:node /app/*.css ./
COPY --from=build --chown=node:node /app/*.json ./
COPY --from=build --chown=node:node /app/*.png ./

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server.js"]
