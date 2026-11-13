# Contexto de build: la RAÍZ del monorepo.  docker build -f apps/web/Dockerfile .
FROM node:24-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/verificador/package.json tools/verificador/
RUN npm ci -w @bc/web -w @bc/core --include-workspace-root
COPY packages/core packages/core
COPY apps/web apps/web
# prebuild compila @bc/core; luego tsc + vite build → apps/web/dist
RUN npm run build -w @bc/web

FROM nginx:stable-alpine
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80 443
