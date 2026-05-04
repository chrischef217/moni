# syntax=docker/dockerfile:1

FROM node:20-bullseye AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-bullseye AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:20-bullseye
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 4000
CMD ["node", "server/src/index.js"]
