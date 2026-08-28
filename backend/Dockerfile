# Backend-Container fuer den Umstiegs-Navigator.
#
# Nur das Backend: das Frontend wird von Vercel statisch ausgeliefert.
# Dieser Container muss dauerhaft laufen, weil drei Dinge Zustand halten,
# den Serverless nicht garantieren kann:
#   - der Poller je EVA (buendelt Abfragen gegen die DB-Ratenlimits)
#   - die offenen SSE-Verbindungen aus /api/live/:eva
#   - der 24-h-LRU-Cache fuer die teuren Overpass-Graphen

# --- Stufe 1: bauen -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Stufe 2: ausliefern --------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Nicht als root laufen.
USER node

EXPOSE 3001

# FIXTURE_EVA darf hier NICHT gesetzt werden: die Fixture-Dateien liegen
# bewusst nicht im Image, der Prozess wuerde beim Start scheitern.

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
