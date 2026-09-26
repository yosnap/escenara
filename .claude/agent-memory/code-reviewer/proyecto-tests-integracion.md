---
name: proyecto-tests-integracion
description: Los tests de integración de medios se saltan en silencio si no se cargan las variables de .env antes de bun test
metadata:
  type: project
---

`bun test` en la raíz deja fuera los tests de integración (`*.integracion.test.ts`) porque usan
`describe.skipIf(!process.env.DATABASE_URL)` y el repo no carga `.env` automáticamente en los tests.
Hay que ejecutarlos así desde la raíz del proyecto:

```sh
set -a; . ./.env; set +a; bun test apps/web/src/server/media/rutas-media.integracion.test.ts
```

**Why:** un `bun test` "todo verde" puede no haber ejecutado nada contra PostgreSQL ni SeaweedFS, así
que una revisión que se apoye solo en esa salida da por probado código que no se ha ejecutado.

**How to apply:** al revisar cambios que toquen `apps/web/src/server/media/**` o rutas `/api/media/**`,
comprobar el recuento de ficheros/tests de la salida y, si los de integración aparecen saltados,
relanzarlos con las variables cargadas antes de dar por verificada la ruta.
