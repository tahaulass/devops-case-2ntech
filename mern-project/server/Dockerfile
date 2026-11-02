# ---- deps: install production dependencies only, from the lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5050
WORKDIR /app
# tini as PID 1: forwards SIGTERM to node (graceful shutdown) and reaps zombies.
RUN apk add --no-cache tini
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json *.mjs ./
COPY --chown=node:node db ./db
COPY --chown=node:node routes ./routes
# Non-root: the official image ships a "node" user (uid 1000).
USER 1000:1000
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5050/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
