# Guía de contribución

Gracias por querer mejorar Escenara. Esta guía explica cómo preparar el entorno, cómo proponer cambios y qué esperamos de cada contribución.

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md). Los fallos de seguridad se comunican de forma privada según la [política de seguridad](SECURITY.md).

## Antes de empezar

- **Busca o abre un issue** antes de trabajar en algo grande, para acordar el enfoque.
- Los cambios pequeños (erratas, documentación, correcciones evidentes) pueden ir directamente en una pull request.
- Escenara trata fotos y voces de personas y claves de proveedores de terceros: cualquier cambio debe respetar el consentimiento, el control de gasto y la privacidad descritos en la [documentación](docs/README.md).

## Entorno local

Requisitos: [Bun](https://bun.sh) 1.4.2 o superior (runtime, gestor de paquetes y tests) y Docker con Docker Compose. La base de datos tiene que ser **PostgreSQL 16 o superior** (una migración usa el predicado `IS JSON`); el Compose del proyecto trae PostgreSQL 18.

```bash
cp .env.example .env        # cambia las contraseñas de ejemplo; .env nunca se sube
openssl rand -base64 32     # ponlo en BETTER_AUTH_SECRET y repítelo para ESCENARA_CLAVE_MAESTRA
bun install
bun run services:up         # PostgreSQL (5421), SeaweedFS S3 (8321) y Mailpit (1021 y 8421)
bun run db:migrate          # aplica las migraciones pendientes (antes: bun run db:backup)
bun run dev                 # web en http://localhost:3021 y worker de la cola
```

`http://localhost:3021/api/health` debe devolver `status: ok` con base de datos y almacenamiento conectados.

### El worker de la cola

Desde la 0.12.0 las generaciones no se envían dentro de la petición del navegador: se encolan en PostgreSQL y las envía un **worker**, que es un proceso aparte (ADR-0003). `bun run dev` arranca los dos y los ata: si uno muere se para el otro, y Ctrl-C los para a los dos, así que el worker se da de baja del registro de latidos y no deja trabajos tomados.

Si prefieres verlos por separado, usa `bun run dev:web` en una terminal y `bun run worker` en otra. **Sin worker no se pierde nada**: los trabajos se quedan en cola y la interfaz avisa de que nadie está atendiendo. Quién está atendiendo la cola se ve en `/admin/trabajos`.

Dos workers a la vez son seguros (la toma usa `FOR UPDATE SKIP LOCKED`), pero en local no hacen falta: antes de arrancar otro, para el que ya tengas para no dejar procesos duplicados.

La **primera cuenta** que crees en `http://localhost:3021/registro` será la administradora (acceso a `/admin`). Los correos de confirmación y de recuperación no salen a internet: los verás en la bandeja de Mailpit, `http://localhost:8421`. Toda la configuración se cambia en **Admin › Ajustes**, no en `.env`: registro, espacio por usuario, correo (servidor y contraseña) y las claves de acceso con Google y GitHub, que son opcionales. Los secretos se guardan cifrados con `ESCENARA_CLAVE_MAESTRA` (ADR-0005); sin esa clave la aplicación arranca, pero la bóveda queda desactivada y no se pueden guardar credenciales. Tus claves de API de KIE.ai y Google Gemini se ponen en **Tu cuenta › Credenciales de IA**.

### Puertos fijos

| Servicio | Puerto |
|---|---|
| Web | 3021 |
| PostgreSQL | 5421 |
| SeaweedFS (API S3) | 8321 |
| Mailpit (SMTP / bandeja web) | 1021 / 8421 |

No cambies de puerto si uno está ocupado: identifica el proceso con `lsof -nP -iTCP:PUERTO -sTCP:LISTEN` y detenlo si es una instancia anterior de Escenara. Así evitamos procesos duplicados y configuraciones distintas entre personas.

## Flujo de trabajo

1. Haz un fork y crea una rama desde `develop` con el formato `{tipo}/{descripción-corta}`, por ejemplo `fix/subtitulos-desfasados` o `feat/filtro-de-plantillas`.
2. Trabaja en commits pequeños siguiendo [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), preferiblemente en español: `feat(personajes): añade registro de consentimiento`, `fix(montaje): corrige el recorte del último clip`.
3. Antes de abrir la pull request ejecuta:

   ```bash
   bun run format
   bun run check    # lint, tipos, tests y build
   ```

4. Abre la pull request contra `develop` y rellena la plantilla.

Las ramas `main` y `develop` no admiten commits directos. El equipo mantenedor publica versiones fusionando `develop` en `main` y etiquetándolas; las reglas completas están en [flujo de versiones y ramas](docs/procesos/flujo-versiones-y-ramas.md).

## Qué esperamos de una contribución

- **Pruebas:** la lógica nueva incluye tests con `bun test` (`*.test.ts` junto al código, importando de `bun:test`).
- **Estilo:** Biome define formato y lint; TypeScript en modo estricto.
- **Tamaño de archivos:** evita archivos de más de 1.000 líneas; divide en módulos con responsabilidades claras.
- **Sin secretos:** nunca subas `.env`, claves API, contraseñas ni fotos o voces de personas reales. Usa datos de prueba inventados.
- **Documentación:** si cambias algo visible o de configuración, actualiza `docs/` y, si cambia la interfaz, añade o actualiza capturas en `docs/assets/capturas/`.
- **Decisiones de arquitectura:** un cambio de tecnología o de contrato público necesita un [ADR](docs/arquitectura/decisiones/README.md).

### Añadir presets o plantillas de prompt a la semilla

El catálogo inicial de presets y plantillas de una instalación nueva sale de un fichero versionado,
`apps/web/src/server/prompts/presets.json`. Para añadir uno:

1. añade una entrada con una **clave nueva** (`clave`), su categoría, su nombre, su descripción **en español** y
   su `valores.prompt` **en inglés**. La descripción es lo que se lee en el botón; el `prompt` es lo que entra
   en el prompt;
2. en la categoría `formato`, la proporción va en `valores.proporcion` («9:16»), y en `duracion`, los segundos
   van en `valores.segundos`. **No** los escribas dentro del texto del prompt: son restricciones que se
   comprueban contra el catálogo de modelos, y la limpieza anti-inyección quita del prompt cualquier medida de
   salida escrita en texto («9:16», «1080p»);
3. ejecuta `bun run db:backup` y `bun run db:migrate`. La semilla es **idempotente** y **no pisa** lo que haya
   cambiado quien administra desde `/admin/presets` o `/admin/plantillas`: solo crea lo que falta.

Los presets y las plantillas de la semilla son **de la instalación** (`owner_id` nulo). Las copias de cada
usuario nacen de duplicar desde «Crear», nunca de la semilla.

## Idioma

El producto y la documentación están en español de España; la versión en inglés llegará más adelante. Puedes escribir issues y pull requests en español o en inglés.

## Licencia de las contribuciones

Escenara se distribuye bajo [AGPL 3.0](LICENSE). Al enviar una contribución aceptas que se publique bajo esa misma licencia.
