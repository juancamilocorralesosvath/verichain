# Contexto de build: la RAÍZ del monorepo (workspaces y @bc/core compilado).
#   docker build -f apps/api/Dockerfile .
# Node 24 es LTS activa.
FROM node:24-slim AS build
WORKDIR /repo
# Solo los manifiestos primero: la capa de dependencias se cachea mientras no cambien.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/verificador/package.json tools/verificador/
RUN npm ci -w @bc/api -w @bc/core --include-workspace-root
COPY packages/core packages/core
COPY apps/api apps/api
# prebuild: compila @bc/core y ejecuta `prisma generate`
RUN npm run build -w @bc/api

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/verificador/package.json tools/verificador/
# Solo dependencias de producción (incluye `prisma` para migrar al arrancar)
RUN npm ci --omit=dev -w @bc/api -w @bc/core && npm cache clean --force
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
# La BD vive en un volumen (/data); el usuario `node` (uid 1000) no es root
RUN mkdir -p /data && chown -R node:node /data /app/apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Migra y arranca. No hay .env en la imagen: todo llega por variables de entorno del compose.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
