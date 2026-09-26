# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.2.0] · 2026-09-26

### Añadido

- Monorepo con workspaces de Bun 1.4.2 y la aplicación Next.js 16 en `apps/web`, ejecutada sobre Bun y servida en `http://localhost:3021`.
- Docker Compose con PostgreSQL 18 (puerto 5421) y SeaweedFS 4.47 con API S3 (puerto 8321) y creación automática del bucket.
- Ruta `/api/health` que comprueba base de datos y almacenamiento con los clientes nativos de Bun, sin exponer configuración.
- Validación de la configuración del servidor con tests (`bun test`).
- Biome para lint y formato, TypeScript estricto y script `bun run check`.
- Licencia AGPL 3.0, README, guía de contribución, código de conducta, política de seguridad y plantillas de issues y pull requests.
- ADR-0001 (licencia AGPL 3.0), ADR-0002 (TypeScript único en el MVP) y ADR-0010 (Bun como runtime).

## [0.1.0] · 2026-09-26

### Añadido

- Flujo de versiones y ramas con definición de terminado.
- Propuesta de dirección visual «Escenario» (capa vibrante, parallax y zonas de claridad).
- Visión de arquitectura e índice de ADR, con despliegue en Easypanel y ADR-0006 de almacenamiento con SeaweedFS.
- Puertos locales fijos: web 3021, PostgreSQL 5421 y SeaweedFS S3 8321.
- Catálogo de APIs y proveedores, plantilla de claves y documento privado excluido de git.
- Lista de cumplimiento y privacidad.
- Índice general de documentación, `.gitignore` y fichero `VERSION`.
