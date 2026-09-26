# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.5.2] · 2026-09-26

### Seguridad

- La descarga desde una URL se conecta a la IP ya comprobada, con el dominio en la cabecera `Host` y en el SNI de TLS (el certificado se valida contra él): un DNS que cambie de respuesta entre la comprobación y la conexión («DNS rebinding») ya no puede desviarla a la red interna.
- Si el servidor sale por un proxy HTTP (`HTTP_PROXY`), las URL http se rechazan, porque el proxy resolvería el dominio por su cuenta; las https siguen funcionando.
- Las direcciones IPv6 se comprueban por su valor y solo se admite el unicast global, en cualquier notación.

### Cambiado

- Descarga más compatible: prueba primero IPv4 y pasa a la siguiente IP si una no responde, envía cabeceras de navegador y admite hasta 5 redirecciones.
- Si se pega la URL de una página web en lugar de la de la imagen, se explica cómo copiar la dirección de la imagen.

### Corregido

- Una redirección con destino inválido devolvía un error interno (500).

## [0.5.1] · 2026-09-26

### Añadido

- Añadir medios desde una URL en el selector y en la biblioteca (`POST /api/media/url`). El servidor descarga el archivo y le aplica las mismas comprobaciones que a una subida; la URL de origen, sin consulta ni fragmento, se guarda en la nueva columna `source_url` y se muestra en los datos del medio.
- Protección frente a SSRF: solo http y https en los puertos 80 y 443, sin credenciales; todas las direcciones resueltas deben ser públicas, también tras cada redirección (máximo 3); 20 s de tiempo total, límite de tamaño leyendo el flujo y como máximo dos descargas simultáneas.

## [0.5.0] · 2026-09-26

### Añadido

- Selector de medios (imagen, vídeo y audio) en `components/ui/media/`: `SelectorMedios` en línea (arrastrar y soltar, subir desde el equipo, elegir de la biblioteca), `DialogoSelectorMedios` modal con selección única o múltiple y `BibliotecaMedios` con búsqueda (espera de 300 ms), filtros por tipo, cuadrícula o lista, paginación, papelera, restauración y borrado definitivo con confirmación.
- Editor de imagen al subir y desde la biblioteca: recorte libre, 1:1, 16:9, 9:16, 4:3 y 3:2, giro ±90°, volteo horizontal y vertical, zoom 1–3×; guardar como nueva o sobrescribir.
- Editor de metadatos: título y texto alternativo en español e inglés, con nombre, tipo, dimensiones, duración, tamaño y fecha en solo lectura.
- API `/api/media` (lista, subida, edición, sustitución, papelera, restauración, borrado y lectura desde el mismo origen), solo disponible donde lo está el admin. Comprueba el tipo real del archivo por su firma binaria y el tamaño máximo por tipo (imagen 10 MB, vídeo 200 MB, audio 50 MB); optimiza las imágenes con Sharp a WebP calidad 85 y 1920 × 1080 como máximo, sin EXIF, y conserva los GIF; guarda en SeaweedFS y sirve URL temporales de una hora.
- Primera tabla de la base de datos (`media`) con Drizzle ORM y migraciones SQL versionadas (ADR-0012); scripts `db:backup`, `db:generate` y `db:migrate`.
- Tests de detección de tipos, reglas de subida, cálculos del editor y de la API contra PostgreSQL y SeaweedFS locales.
- Captura del selector de medios en `docs/assets/capturas/`.

### Cambiado

- `Dialogo` admite control externo (`abierto`, `onAbiertoCambio`) y un tamaño grande (`tamano="xl"`).
- La sección «Selector de medios» del catálogo muestra el componente funcionando con archivos reales.

## [0.4.0] · 2026-09-26

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
