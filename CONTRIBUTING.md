# Guía de contribución

Gracias por querer mejorar Escenara. Esta guía explica cómo preparar el entorno, cómo proponer cambios y qué esperamos de cada contribución.

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md). Los fallos de seguridad se comunican de forma privada según la [política de seguridad](SECURITY.md).

## Antes de empezar

- **Busca o abre un issue** antes de trabajar en algo grande, para acordar el enfoque.
- Los cambios pequeños (erratas, documentación, correcciones evidentes) pueden ir directamente en una pull request.
- Escenara trata fotos y voces de personas y claves de proveedores de terceros: cualquier cambio debe respetar el consentimiento, el control de gasto y la privacidad descritos en la [documentación](docs/README.md).

## Entorno local

Requisitos: [Bun](https://bun.sh) 1.4.2 o superior (runtime, gestor de paquetes y tests) y Docker con Docker Compose.

```bash
cp .env.example .env        # cambia las contraseñas de ejemplo; .env nunca se sube
bun install
bun run services:up         # PostgreSQL (5421), SeaweedFS S3 (8321) y Mailpit (1021 y 8421)
bun run db:migrate          # aplica las migraciones pendientes (antes: bun run db:backup)
bun run dev                 # http://localhost:3021
```

`http://localhost:3021/api/health` debe devolver `status: ok` con base de datos y almacenamiento conectados.

La **primera cuenta** que crees en `http://localhost:3021/registro` será la administradora (acceso a `/admin`). Los correos de confirmación y de recuperación no salen a internet: los verás en la bandeja de Mailpit, `http://localhost:8421`. Google y GitHub son opcionales; sus claves van en `.env` (instrucciones en `.env.example`). El resto de la configuración (registro, espacio por usuario, correo…) se cambia en **Admin › Ajustes**, no en `.env`.

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

## Idioma

El producto y la documentación están en español de España; la versión en inglés llegará más adelante. Puedes escribir issues y pull requests en español o en inglés.

## Licencia de las contribuciones

Escenara se distribuye bajo [AGPL 3.0](LICENSE). Al enviar una contribución aceptas que se publique bajo esa misma licencia.
