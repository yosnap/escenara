<p align="center">
  <img src="docs/branding/escenara-horizontal-light.svg#gh-light-mode-only" alt="Escenara" width="320">
  <img src="docs/branding/escenara-horizontal-dark.svg#gh-dark-mode-only" alt="Escenara" width="320">
</p>

<p align="center"><strong>Da vida a cada escena</strong><br>Estudio abierto de personajes y vídeo</p>

<p align="center">
  <a href="LICENSE"><img alt="Licencia AGPL 3.0" src="https://img.shields.io/badge/licencia-AGPL--3.0-2753D7"></a>
  <img alt="Versión 0.4.0" src="https://img.shields.io/badge/versión-0.4.0-F0663D">
  <img alt="Estado: en desarrollo" src="https://img.shields.io/badge/estado-en%20desarrollo-485269">
</p>

---

**Escenara** es una aplicación web de código abierto para crear un **personaje persistente** a partir de fotos autorizadas de una persona o de un animal, y producir con él publicaciones y **vídeos cortos** (Reels, TikTok, Shorts) escena a escena.

- **Trae tus propias claves (BYOK).** Cada persona conecta sus proveedores de IA; Escenara no cobra por la inferencia.
- **Guiado por botones.** Eliges especialidad, formato, estilo, vestuario y duración; todo es editable.
- **Nada se genera sin tu aprobación.** Ves el guion, el storyboard y una estimación de coste antes de gastar.
- **Consentimiento y privacidad primero.** Registro de derechos, sin menores, etiquetado de contenido sintético y borrado completo.

> 🚧 **Proyecto en fase temprana (0.4.0).** Ahora mismo hay base técnica, infraestructura local, un prototipo de generación con KIE y el sistema de diseño con su catálogo de componentes; la experiencia de creación llega en las próximas versiones. Iremos añadiendo capturas de cada apartado aquí y en la guía de usuario.

## Empezar en local

Requisitos: **[Bun](https://bun.sh) 1.4.2+** y **Docker** con Docker Compose.

```bash
git clone <url-del-repositorio> escenara
cd escenara
cp .env.example .env        # cambia las contraseñas de ejemplo
bun install
bun run services:up         # PostgreSQL y SeaweedFS (almacenamiento S3)
bun run dev                 # http://localhost:3021
```

Comprueba que todo está conectado en <http://localhost:3021/api/health>: debe responder `{"status":"ok","database":"ok","storage":"ok"}`.

| Servicio | Dirección local |
|---|---|
| Aplicación web | `http://localhost:3021` |
| PostgreSQL | `localhost:5421` |
| SeaweedFS (API S3) | `http://localhost:8321` |

Los puertos son fijos. Si alguno está ocupado, libera el proceso que lo usa en lugar de cambiar el puerto (detalles en [CONTRIBUTING.md](CONTRIBUTING.md)).

## Comandos

| Comando | Qué hace |
|---|---|
| `bun run dev` | Arranca la web en modo desarrollo en el puerto 3021 |
| `bun run check` | Lint, tipos, tests y build: lo que debe pasar antes de proponer un cambio |
| `bun run format` | Formatea y ordena imports con Biome |
| `bun run services:up` / `bun run services:down` | Levanta o detiene PostgreSQL y SeaweedFS |

## Estructura

```text
apps/web/        Aplicación Next.js sobre Bun (interfaz y API)
packages/        Paquetes compartidos (llegarán con los workers y adaptadores)
docs/            Documentación del producto, marca, arquitectura y procesos
docker-compose.yml  Servicios locales
```

## Documentación

- [Mapa de la documentación](docs/README.md)
- [Visión de arquitectura](docs/arquitectura/vision-arquitectura.md) y [decisiones (ADR)](docs/arquitectura/decisiones/README.md)
- [APIs y proveedores](docs/recursos/apis-y-proveedores.md)
- [Guía de marca](docs/branding/ESCENARA_BRAND_GUIDE.md) y [dirección visual](docs/diseno/direccion-visual-escenario.md)
- [Cumplimiento y privacidad](docs/legal/cumplimiento-y-privacidad.md)
- [Registro de cambios](docs/CHANGELOG.md)

## Contribuir

¡Las contribuciones son bienvenidas! Lee la [guía de contribución](CONTRIBUTING.md) y el [código de conducta](CODE_OF_CONDUCT.md). Para fallos de seguridad, sigue la [política de seguridad](SECURITY.md) y no abras un issue público.

## Licencia

Escenara se publica bajo la [GNU Affero General Public License v3.0](LICENSE). Si ofreces una versión modificada de Escenara como servicio en red, debes poner su código fuente a disposición de quienes la usen. Los modelos, fuentes, música y demás recursos de terceros tienen sus propias licencias.
