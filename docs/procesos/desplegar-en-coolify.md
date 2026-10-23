# Despliegue en Coolify

Desde la 0.56.5, escenara.com se sirve desde Coolify, en el proyecto «Escenara» del servidor Humanitek.
La guía de Easypanel queda como referencia del entorno anterior.

## Recursos

| Recurso | Tipo en Coolify | Qué es |
|---|---|---|
| `escenara-db` | PostgreSQL 18 | Base de datos, sin puerto público salvo durante una migración controlada. |
| `escenara-almacen` | Servicio (compose) | SeaweedFS 4.47 con volumen `/data` y S3 en el puerto 8333 por HTTPS. |
| `escenara-app` | Aplicación (Docker Compose) | `docker-compose.coolify.yml`: web, worker y demos desde `main`. |
| `escenara-docs` | Aplicación (Dockerfile) | `apps/docs/Dockerfile`, puerto 8080, dominio `docs.escenara.com`. |

En `escenara-app` solo compila `web`. El worker y las demos usan la misma imagen local
(`escenara-app:latest`), así que siempre ejecutan el mismo commit y la compilación no se repite.
El dominio `https://escenara.com` se asigna al servicio `web`, puerto 3021.

## Variables

En `escenara-app`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ESCENARA_CLAVE_MAESTRA`,
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` y `DEMOS_CORREO`.
El compose falla al arrancar si falta alguna obligatoria. Las reglas de la guía de Easypanel siguen
vigentes: conexión directa o pooler en modo sesión, `S3_ENDPOINT` accesible desde el navegador y la
misma clave maestra que cifró los secretos.

## Publicar una versión

1. Copia de seguridad de `escenara-db` desde Coolify (Backups → Backup now).
2. Si la versión trae migraciones, ábrelas desde la terminal de Coolify en el contenedor `web`:
   `bun scripts/migrar.ts`. La aplicación no migra al arrancar.
3. Despliega `escenara-app`; después `escenara-docs` si cambió la documentación.
4. Comprueba `https://escenara.com/api/health` y la versión del pie.

La imagen ejecuta `bun run build`, que incluye el presupuesto de JavaScript: si falla en local,
falla el despliegue.
