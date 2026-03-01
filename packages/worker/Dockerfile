FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY packages/control-api/package.json packages/control-api/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci

COPY . .
RUN npm run build --workspace @pi-mission-control/worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/control-api/package.json packages/control-api/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/web/package.json packages/web/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/worker ./packages/worker

CMD ["node", "packages/worker/dist/dev.js"]
