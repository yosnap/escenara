<p align="center">
  <img src="docs/branding/escenara-horizontal-light.svg#gh-light-mode-only" alt="Escenara" width="320">
  <img src="docs/branding/escenara-horizontal-dark.svg#gh-dark-mode-only" alt="Escenara" width="320">
</p>

<p align="center"><strong>Da vida a cada escena</strong><br>Estudio abierto de personajes y vídeo</p>

<p align="center">
  <a href="LICENSE"><img alt="Licencia AGPL 3.0" src="https://img.shields.io/badge/licencia-AGPL--3.0-2753D7"></a>
  <img alt="Versión 0.19.0" src="https://img.shields.io/badge/versión-0.19.0-F0663D">
  <img alt="Estado: en desarrollo" src="https://img.shields.io/badge/estado-en%20desarrollo-485269">
</p>

---

**Escenara** es una aplicación web de código abierto para crear un **personaje persistente** a partir de fotos autorizadas de una persona o de un animal, y producir con él publicaciones y **vídeos cortos** (Reels, TikTok, Shorts) escena a escena.

- **Trae tus propias claves (BYOK).** Cada persona conecta sus proveedores de IA; Escenara no cobra por la inferencia.
- **Guiado por botones.** Eliges especialidad, formato, estilo, vestuario y duración; todo es editable.
- **Nada se genera sin tu aprobación.** Ves el guion, el storyboard y una estimación de coste antes de gastar.
- **Consentimiento y privacidad primero.** Registro de derechos, sin menores, etiquetado de contenido sintético y borrado completo.

> 🚧 **Proyecto en fase temprana (0.19.0).** **Ya hay personajes:** creas una persona o un animal con sus fotos de referencia y su registro de consentimiento, y sin consentimiento vigente no se puede generar con él ([guía «Crear un personaje»](docs/guias/crear-un-personaje.md)). **Y las fotos ya no se suben a ciegas:** la ficha dice qué vista falta, el visor te guía con el marco «Enfoque» y el control de calidad —local, sin gastar créditos— rechaza lo borroso, lo oscuro, lo pequeño y lo repetido diciendo qué hacer; si falta una vista se puede generar, siempre etiquetada como generada y sin contar como foto ([guía «Buenas referencias»](docs/guias/buenas-referencias.md)). **Y la ficha del personaje ya no es un archivo:** sus rasgos, estilo, vestuario, personalidad y voz prevista **se añaden al prompt** de cada fotograma y de cada clip, junto con las mejores fotos elegidas por cobertura de vistas, y ves el contexto exacto antes de confirmar el gasto; cada cambio de apariencia crea una **versión**, los trabajos citan la que usaron y lo que estaba aprobado con la anterior queda marcado para revisar ([guía «La ficha y las versiones de un personaje»](docs/guias/ficha-y-versiones-de-personaje.md)). La **hoja de personaje** la monta el servidor con sus fotos, sin IA y sin coste. Al elegir un personaje en «Crear» se le envían **varias** fotos suyas, que guían mucho mejor la identidad que una sola, y al borrarlo desaparecen también los vídeos y fotogramas hechos con él. La imagen de un tercero exige su documento firmado y una revisión humana; la declaración de mayoría de edad es obligatoria y está documentada como control, no como garantía. **Y se puede crear:** con tu propia clave de KIE, en «Crear» eliges una imagen y el modelo, describes la escena, ves el coste estimado y obtienes un fotograma vertical y un clip corto guardados en tu biblioteca, con su historial ([guía «Tu primer vídeo»](docs/guias/tu-primer-video.md)). **Y crear ya no es un campo de texto en blanco:** eliges con **botones** la especialidad, el formato, el look, el vestuario, la duración y la acción, **ves el texto exacto que se le enviará al modelo** —en inglés, porque responden mejor, con las descripciones en español— y puedes editarlo antes de gastar; lo que el modelo elegido no admite sale deshabilitado con su motivo, así que no se promete ningún formato que no se pueda generar ([guía «Presets y plantillas»](docs/guias/presets-y-plantillas.md)). Los trabajos van a una **cola persistente** que atiende un worker, así que puedes cerrar el navegador sin perder nada, y cada trabajo **reserva su coste estimado** de un presupuesto que ves en el «depósito de presupuesto» ([guía del depósito](docs/guias/deposito-de-presupuesto.md)). Los modelos disponibles, sus parámetros comprobados y sus precios medidos viven en un catálogo que se gestiona en el panel de administración. Alrededor hay base técnica, infraestructura local, el sistema de diseño con su catálogo de componentes, el selector de medios con editor de imagen, la portada con un escaparate de personajes ficticios, las cuentas de usuario, la biblioteca de medios de cada usuario y la bóveda cifrada para las claves de API. **Y ya hay proyectos con guion:** describes una idea y obtienes un concepto, un guion por escenas y un plan con su coste estimado por escena y en total, con las afirmaciones que conviene verificar señaladas; nada se produce hasta que apruebas el plan, y editar una escena aprobada invalida su aprobación y te lo dice. El asistente que propone el guion es **opcional y llega apagado**: escribirlo a mano es un camino de primera clase ([guía «El asistente de guion»](docs/guias/asistente-de-guion.md)). **Y antes de gastar, una sola zona te dice si se puede generar:** «Antes de generar» responde **Listo**, **Necesita ajustes**, **Requiere revisión** o **Bloqueado**, siempre con el motivo y la siguiente acción, y con el enlace al sitio donde se arregla; un aviso salvable se puede confirmar expresamente, y un bloqueo no se salta nunca, tampoco desde la API ([guía «Por qué no puedo generar»](docs/guias/por-que-no-puedo-generar.md)). Esas comprobaciones son gratis y las hace un **motor de reglas único** en el servidor, con su versión guardada en cada evaluación. **Y ya se produce:** un proyecto con el plan aprobado se genera escena a escena en su rejilla de producción, con el fotograma clave, tu aprobación y el clip de 4 s; el avance se cuenta por **etapas reales** —preparando, en el proveedor, generando, guardando, listo— y **nunca con un porcentaje inventado**; puedes ver el fotograma con las **zonas seguras** de TikTok, Reels y Shorts antes de animarlo, **regenerar una sola escena** sin tocar las demás (lo anterior se conserva en su historial con su modelo y su coste) y **cancelar** sabiendo exactamente qué se cancela de verdad y qué **se cobrará**, porque el proveedor no admite parar una tarea en marcha; un fallo suyo **no reintenta nada por su cuenta**: los reintentos de pago los autorizas tú, escena a escena ([guía «Producir tu proyecto»](docs/guias/producir-tu-proyecto.md)). La revisión de continuidad, la voz, los subtítulos y el montaje final llegan en las próximas versiones. Iremos añadiendo capturas de cada apartado aquí y en la guía de usuario.

<p align="center">
  <img alt="Portada de Escenara con parallax, la mascota Chispa y tarjetas de personajes ficticios" src="docs/assets/capturas/0.6.0-portada-claro.webp" width="720">
</p>

## Empezar en local

Requisitos: **[Bun](https://bun.sh) 1.4.2+** y **Docker** con Docker Compose.

```bash
git clone <url-del-repositorio> escenara
cd escenara
cp .env.example .env        # cambia las contraseñas y genera los secretos que indica el archivo
bun install
bun run services:up         # PostgreSQL, SeaweedFS (almacenamiento S3) y Mailpit (correo local)
bun run db:migrate          # crea o actualiza las tablas
bun run dev                 # web en http://localhost:3021 y worker de la cola
```

Comprueba que todo está conectado en <http://localhost:3021/api/health>: debe responder `{"status":"ok","database":"ok","storage":"ok"}`. Después crea tu cuenta en <http://localhost:3021/registro>: la primera es la administradora y los correos de confirmación llegan a Mailpit. Tus claves de API van en **Tu cuenta › Credenciales de IA**, cifradas con la clave maestra del servidor; la configuración de la instalación, en **Admin › Ajustes**.

| Servicio | Dirección local |
|---|---|
| Aplicación web | `http://localhost:3021` |
| PostgreSQL | `localhost:5421` |
| SeaweedFS (API S3) | `http://localhost:8321` |
| Mailpit (bandeja de correo local) | `http://localhost:8421` (SMTP en `localhost:1021`) |

Los puertos son fijos. Si alguno está ocupado, libera el proceso que lo usa en lugar de cambiar el puerto (detalles en [CONTRIBUTING.md](CONTRIBUTING.md)).

## Comandos

| Comando | Qué hace |
|---|---|
| `bun run dev` | Arranca la web en el puerto 3021 **y el worker de la cola** |
| `bun run dev:web` / `bun run worker` | Arranca solo la web o solo el worker (útil para verlos por separado) |
| `bun run check` | Lint, tipos, tests y build: lo que debe pasar antes de proponer un cambio |
| `bun run format` | Formatea y ordena imports con Biome |
| `bun run services:up` / `bun run services:down` | Levanta o detiene PostgreSQL y SeaweedFS |
| `bun run db:backup` / `bun run db:migrate` | Copia la base de datos a `backups/bd/` / aplica las migraciones pendientes |
| `bun run db:generate` | Genera una migración SQL a partir de los cambios del esquema |

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
