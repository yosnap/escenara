# ADR-0012 · Acceso a PostgreSQL y migraciones con Drizzle ORM

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.5.0

## Contexto

El selector de medios (0.5.0) crea la primera tabla del proyecto (`media`). A partir de aquí llegan cuentas (0.7.0), colecciones y permisos (0.8.0), credenciales BYOK (0.9.0) y trabajos (0.11.0), así que hace falta un esquema tipado y migraciones versionadas y revisables. La pila es Bun (ADR-0010) con su cliente nativo `Bun.SQL`.

## Opciones

1. **SQL a mano con `Bun.SQL`.** Sin dependencias; falla primero en los tipos de las filas y en llevar el control de las migraciones a mano.
2. **Prisma.** Ecosistema maduro; supone un motor de consultas aparte, un generador de cliente y un encaje menos directo con `Bun.SQL`.
3. **Drizzle ORM.** Esquema en TypeScript, consultas cercanas al SQL, controlador oficial para `Bun.SQL` (`drizzle-orm/bun-sql`) y migraciones SQL generadas por `drizzle-kit`; falla primero si hace falta SQL muy específico, que sigue siendo posible con `sql```.

## Decisión

Drizzle ORM (decisión del propietario, 2026-09-26):

- Esquema en `apps/web/src/server/db/esquema.ts`; cliente único por proceso en `server/db/cliente.ts`.
- Migraciones SQL versionadas en `apps/web/drizzle/`, generadas con `bun run db:generate` y revisadas antes de confirmarlas.
- Se aplican con `bun run db:migrate`, siempre **después** de una copia con `bun run db:backup` (vuelca la base a `backups/bd/`, fuera de git).
- Los tests de integración aplican las migraciones pendientes contra el PostgreSQL local antes de ejecutarse.

## Consecuencias

- Tipos de filas y consultas comprobados por TypeScript sin paso de generación de cliente.
- Las migraciones son SQL legible: se revisan en el diff como cualquier otro cambio.
- Dependencias nuevas: `drizzle-orm` y `drizzle-kit` (desarrollo). Revisar las notas de versión al actualizar, porque la API aún cambia entre versiones menores.
