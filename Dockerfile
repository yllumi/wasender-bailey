# syntax=docker/dockerfile:1

# --- Stage 1: dependencies -------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# bun.lock* bersifat opsional: file ini gitignored, jadi build tetap jalan
# di clone baru yang belum punya lockfile.
COPY package.json bun.lock* ./
RUN bun install --production

# --- Stage 2: runtime ------------------------------------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# curl dipakai oleh HEALTHCHECK
RUN apk add --no-cache curl

# Direktori state runtime. Disiapkan di image supaya ownership volume yang
# di-mount ke /app/data benar (uid 1000 = user `bun`).
RUN mkdir -p data/auth_info_baileys/sessions \
 && chown -R bun:bun /app

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json tsconfig.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public

ENV NODE_ENV=production

# Image oven/bun sudah menyediakan user non-root `bun` (uid 1000)
USER bun

# Port statis, di-hardcode di src/index.ts
EXPOSE 8990

# GET /health bersifat publik, jadi tidak butuh kredensial.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:8990/health" || exit 1

CMD ["bun", "run", "src/index.ts"]
