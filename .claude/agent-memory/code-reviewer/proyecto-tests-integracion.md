---
name: proyecto-tests-integracion
description: Los tests de integración se saltan en silencio sin DATABASE_URL; hoy usan bases aisladas escenara_pruebas_* en el Postgres de 5421
metadata:
  type: project
---

`bun test` deja fuera los tests `*.integracion.test.ts` si no hay `DATABASE_URL` (`describe.skipIf`), así que
«todo verde» puede no haber ejecutado nada contra PostgreSQL ni SeaweedFS. Cuenta los `skip` de la salida.

Desde al menos la 0.2x, cada suite llama a `usarBaseDeDatosDePrueba("escenara_pruebas_<suite>")` y trabaja en
su propia base dentro del contenedor `escenara-postgres-1` (puerto 5421), no en `escenara`. Ya no escriben en
los `settings` de la instalación del propietario (la nota antigua de la 0.8.0 está superada; compruébalo en la
cabecera del test si dudas).

**Why:** una revisión que se apoye en un `bun test` sin variables da por probado código que no se ha ejecutado.

**How to apply:** si el encargo prohíbe tocar 5421, no lances los de integración y dilo en el informe. Para
probar migraciones sin tocar `escenara`: `docker exec escenara-postgres-1 createdb -U escenara <propia>` +
`pg_dump escenara | psql <propia>`, aplicar los `.sql` con `psql -1 -v ON_ERROR_STOP=1` y `dropdb` al acabar.

Si el encargo prohíbe escribir en 5421/8321 (2026-09-30, revisión 0.39.0): contenedor propio `postgres:18-alpine`
(p. ej. puerto 5491) + MinIO propio (9391, `mc mb` del bucket), `pg_dump` de solo lectura con `docker exec
escenara-postgres-1`, y restaurar con el `psql` **del contenedor** (el `psql` de Homebrew no entiende `\restrict`
de pg18). Lanzar `bun test` con `env -i` y variables mínimas: el `.env` real trae `TYPESAFE_API_KEY` y otras claves
de proveedor que no deben cargarse. Así la suite completa corre sin saltos.

Variables mínimas con `env -i` (0.41.0): `DATABASE_URL`, las cinco `S3_*` (también para `bun scripts/migrar.ts`,
que falla sin ellas), `BETTER_AUTH_SECRET/URL` y `ESCENARA_CLAVE_MAESTRA` = `openssl rand -base64 32` (con otro
formato los 184 ficheros fallan al cargar `boveda/cifrado.ts`). Lanzar `bun test` desde `apps/web`.

Desde 0.47.0 no uses `escenara` (ni otra palabra corriente de 8+ letras) como contraseña de BD ni como clave S3: el
filtro de secretos de la exportación (`datos/secretos.ts`) retira su valor exacto, corrompe `"escenara.proyecto"` y
fallan 7 tests de exportación/borrado con «proyecto.json no valida». Usa valores aleatorios.

Para probar Better Auth sin navegador: `(await auth()).handler(new Request(...))` desde un test en el scratchpad que
importe por ruta absoluta (`ROOT=…/apps/web/src/server`, `Bun.resolveSync("drizzle-orm", ROOT)`), lanzado con `bun test`
desde `apps/web` (carga su `bunfig` con el correo simulado). Para comparar con el «antes»: `git archive <commit> --
apps/web package.json | tar -x` y enlace a `apps/web/node_modules`.

`docker rm -f` sin `-v` deja los volúmenes anónimos de postgres/minio: usa `docker rm -fv <nombre>` (nunca prune).

En zsh, `env -i PATH=$PATH …` en línea falla con «command too long» (el PATH del propietario es enorme). Mejor un
fichero `env-*.sh` en el scratchpad con `export` (PATH corto: `~/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin`) y
`env -i /bin/bash -c "source env.sh && bun test"`. El bucket de MinIO se crea con `docker exec <minio> mc mb`.
