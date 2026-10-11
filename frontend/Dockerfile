# DAOvault website image. Targets:
#   development  Vite dev server, source bind-mounted by docker-compose.dev.yml
#   production   `vite build` output served by unprivileged Nginx (nginx/default.conf)
# `npm run dev` / `npm run build` on the host do not use this file.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- development ----------
FROM deps AS development
ENV DOCKER=1
EXPOSE 3000
CMD ["npx", "vite"]

# ---------- production ----------
FROM deps AS build
# VITE_* values are baked into the website at build time (public: never put a secret here)
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_BSC_CHAIN_ID
ARG VITE_BSC_RPC_URL
ARG VITE_USDT_CONTRACT_ADDRESS
ARG VITE_PAYMENT_CONTRACT_ADDRESS
ARG VITE_ACTIVATION_AMOUNT_USDT=300
ARG VITE_ALLOW_MAINNET_PAYMENTS=false
ARG VITE_LAUNCH_DATE
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/proxy-api.conf /etc/nginx/snippets/proxy-api.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
