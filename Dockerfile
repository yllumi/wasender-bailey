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

# Runtime state dibuat sebagai FILE, bukan direktori. Docker membuat direktori
# bila bind mount tidak menemukan file di host, dan itu akan membuat app gagal
# menulis sessions_registry.json.
RUN mkdir -p auth_info_baileys/sessions \
 && printf '[]\n' > sessions_registry.json \
 && touch .env \
 && chown -R bun:bun /app

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json tsconfig.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public

ENV NODE_ENV=production
ENV PORT=8990

# Image oven/bun sudah menyediakan user non-root `bun` (uid 1000)
USER bun

EXPOSE 8990

# GET /health bersifat publik, jadi tidak butuh kredensial.
# ${PORT:-8990} diekspansi saat runtime oleh shell container, bukan saat build.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8990}/health" || exit 1

CMD ["bun", "run", "src/index.ts"]
