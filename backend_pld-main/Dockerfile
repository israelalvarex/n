# Build stage
FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Tell pnpm and other tools this is a headless CI environment
ENV CI=true

# La versión de pnpm sale de "packageManager" en package.json: con pnpm@latest
# el lockfile v9 puede quedar fuera de rango y --frozen-lockfile falla.
RUN corepack enable

# Manifests primero para que la capa de dependencias se cachee. prisma.config.ts
# y el schema tienen que estar antes del install: el postinstall corre
# `prisma generate` y sin ellos truena.
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

# This will now safely skip local node_modules thanks to .dockerignore
COPY . .

RUN pnpm build

# Production stage
FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Railway inyecta PORT; main.ts lo lee y cae a 3000 si no viene.
CMD ["node", "dist/src/main"]
