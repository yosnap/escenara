# ADR-0010 · Bun como runtime, gestor de paquetes y ejecutor de tests

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.2.0

## Contexto

La base 0.2.0 se montó con Node.js 22, pnpm y Vitest. El propietario decide usar **Bun** como runtime del proyecto.

## Decisión

- **Bun 1.4.2 o superior** es el runtime, el gestor de paquetes (workspaces de Bun, `bun.lock`) y el ejecutor de tests (`bun test`). Se retiran pnpm y Vitest.
- La aplicación Next.js se ejecuta con el runtime de Bun (`bun --bun next dev|build|start`).
- Para PostgreSQL y S3 se usan los clientes nativos de Bun (`Bun.SQL` y `Bun.S3Client`) en lugar de `pg` y el SDK de AWS. Ambos hablan los protocolos estándar, así que se mantiene lo acordado en ADR-0006: cualquier almacenamiento compatible con S3 sirve.

## Evidencia

- Con Bun 1.3.12, `next build` bajo `--bun` falla al cargar el runtime de Next.js 16 («Expected CommonJS module to have a function wrapper»). Con Bun 1.4.2 funciona: de ahí la versión mínima.
- Con `pg`, el servidor de desarrollo bajo Bun no resolvía `pg-types` desde el paquete externo de Turbopack. Los clientes nativos de Bun eliminan el problema y tres dependencias.
- Next.js sigue exigiendo `@types/node` al compilar, aunque el runtime sea Bun.

## Consecuencias

- Quien contribuya necesita Bun ≥ 1.4.2 (y Docker); ya no hace falta Node.js ni pnpm.
- El código de servidor depende de APIs de Bun; ejecutar Escenara sobre Node.js requeriría adaptarlo.
- Las imágenes de despliegue (Easypanel) se basarán en la imagen oficial de Bun.
