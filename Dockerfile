# Étape 1 : installation des dépendances de production (better-sqlite3 est un module natif)
FROM node:22-alpine AS deps
# outils de compilation au cas où aucun binaire précompilé n'est disponible
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Étape 2 : image finale légère, sans npm
FROM node:22-alpine
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/app/data/shortly.db
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
