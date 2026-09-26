# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.4.0] · pendiente de release

### Añadido

- Catálogo de componentes en `/admin/componentes` (solo en desarrollo hasta la autenticación): botones, campos, casillas, interruptores, opciones, selector único, selector múltiple en caja con chips, buscador, chips de preset por especialidad, pegatinas, anillos de historia, tarjetas 9:16, avisos de los cuatro estados de preparación, progreso por etapas, depósito de presupuesto, estado vacío, cargador Chispa, diálogo, ayudas, pestañas, parallax por capas y confeti de celebración; hueco reservado para el selector de medios.
- Marca 0.5.0: paleta vibrante, degradados y tiempos de movimiento en `escenara.brand.json`; guía ampliada con la capa «Escenario» y las zonas de claridad.
- Tokens CSS generados desde la marca (`bun run tokens`) con tests de sincronía y de contraste WCAG AA en ambos temas.
- Tema sistema, claro u oscuro persistente y sin destello; Manrope autoalojada; favicon, SVG monocromo y PNG de la marca.
- Tests que impiden usar el `<select>` nativo y los bordes o sombras de color en un solo lateral de tarjetas y bloques.
- ADR-0011: Tailwind CSS 4, Base UI, Motion y Lucide.
- Capturas del catálogo en `docs/assets/capturas/`.

### Cambiado

- Borde del tema claro de `#8992A5` a `#858EA1` para alcanzar el contraste 3:1 que exige la guía.

## [0.3.0] · 2026-09-26

### Añadido

- Prototipo técnico de generación en `spikes/prototipo` (Bun): subida de referencias, fotograma clave y animación con KIE, clientes mínimos de KIE y Google, y control de presupuesto con tope que bloquea cualquier paso que no quepa.
- ADR-0009: KIE.ai como único proveedor inicial (`nano-banana-2-lite` y `veo3_lite`); Google aplazado.

### Cambiado

- PRD y documentación de proveedores: Google pasa a aplazado.
- `.gitignore`: carpeta `datos-privados/` para fotos de referencia y medios generados.

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
