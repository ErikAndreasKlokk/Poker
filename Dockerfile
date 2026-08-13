# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

# The build never opens a connection, but drizzle.config.ts reads the variable.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/poker

# Produces both bundles: build/ from Vite and build-server/ from esbuild.
RUN npm run build
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# server.js is the entry: adapter-node's own entry cannot host the WebSocket
# server, so both bundles ship and server.js wires them into one HTTP server.
COPY --from=builder --chown=appuser:nodejs /app/build ./build
COPY --from=builder --chown=appuser:nodejs /app/build-server ./build-server
COPY --from=builder --chown=appuser:nodejs /app/server.js ./
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
