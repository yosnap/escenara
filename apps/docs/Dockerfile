# syntax=docker/dockerfile:1
# Web de documentación de Escenara (docs.escenara.com).
# Contexto de build: la raíz del repositorio, porque las guías viven en docs/.
#   docker build -f apps/docs/Dockerfile -t escenara-docs .
# Solo se copian las rutas públicas; Dockerfile.dockerignore deja fuera el resto por si acaso.

FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/docs/package.json apps/docs/package.json
RUN bun install --frozen-lockfile --filter @escenara/docs
COPY apps/docs apps/docs
COPY docs/guias docs/guias
COPY docs/assets docs/assets
COPY docs/branding docs/branding
# astro build y, después, la comprobación de que no se publica nada privado ni con forma de clave.
RUN bun run --cwd apps/docs build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS web
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/salud || exit 1
