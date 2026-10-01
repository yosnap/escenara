# Misma imagen para web, worker, migraciones y archivado privado de demos.
FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY spikes/prototipo/package.json spikes/prototipo/package.json
RUN bun install --frozen-lockfile
COPY apps/web apps/web
COPY docs/CHANGELOG.md docs/CHANGELOG.md
COPY docs/branding/escenara.brand.json docs/branding/escenara.brand.json
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN bun run build && test -s .next/BUILD_ID

FROM oven/bun:1.4.2 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/docs/privado/demos \
    && chown -R bun:bun /app/docs
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/web ./apps/web
COPY --from=build --chown=bun:bun /app/docs/CHANGELOG.md ./docs/CHANGELOG.md
COPY --from=build --chown=bun:bun /app/docs/branding/escenara.brand.json ./docs/branding/escenara.brand.json
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER bun
WORKDIR /app/apps/web
EXPOSE 3021
# La salud HTTP se comprueba en /api/health; los procesos de cola y archivo usan la misma imagen.
CMD ["bun", "--bun", "next", "start", "--hostname", "0.0.0.0", "--port", "3021"]
