# DAOvault API image. Targets:
#   development  source bind-mounted by docker-compose.dev.yml, tsx watch reloads on save
#   production   compiled dist/, production dependencies only, runs as the non-root `node` user
# `npm run dev` / `npm start` on the host do not use this file.

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL; ca-certificates for HTTPS calls to the BSC RPC
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate

# ---------- development ----------
FROM deps AS development
ENV NODE_ENV=development
EXPOSE 5000
# migrate deploy (never `migrate dev`: no shadow database), then the watcher
CMD ["sh", "-c", "npx --no prisma migrate deploy && npm run dev"]

# ---------- production ----------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev \
  && npx --no prisma generate

FROM base AS production
ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# scripts/start.mjs: prisma migrate deploy, then dist/server.js (same as Render)
CMD ["node", "scripts/start.mjs"]
