FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY packages/control-api/package.json packages/control-api/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci

COPY . .
RUN npm run build --workspace @pi-mission-control/worker \
  && npm run build --workspace @pi-mission-control/control-api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/control-api/package.json packages/control-api/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/web/package.json packages/web/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/control-api ./packages/control-api
COPY --from=build /app/packages/worker ./packages/worker

EXPOSE 8787
CMD ["node", "packages/control-api/dist/dev.js"]
