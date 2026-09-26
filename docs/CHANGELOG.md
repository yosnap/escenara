# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.6.0] · 2026-09-26

### Añadido

- Portada en `/`: cabecera con parallax por capas (degradados, marco Enfoque y chispas), escaparate de personajes, «Cómo funciona» en tres pasos, zona de claridad sobre la clave propia, el control de gasto, el consentimiento y el código abierto, y pie con contacto.
- Escaparate de personajes **ficticios** (Lucía, Marco, Aisha, Nube, Tomás y Sofía) generados con KIE solo a partir de texto, sin fotos de personas reales, con dos vídeos de 4 s y una segunda escena de Lucía que muestra que el personaje se mantiene. Todo el contenido sintético se etiqueta como «Generado con IA». Gasto real: 148 créditos (≈ 0,74 USD); scripts reproducibles en `spikes/prototipo/escaparate.ts` y `escaparate-web.ts`.
- Chispa, la mascota: la estrella del logotipo con cara que saluda, señala y celebra (SVG animado con Motion, estática con movimiento reducido), también en el catálogo de componentes.
- Logotipo como componente que se adapta al tema y `claseBoton` para dar aspecto de botón a enlaces.
- Las tarjetas 9:16 admiten un vídeo corto con botón de pausa y reproducción (WCAG 2.2.2): solo se reproduce en pantalla y con la pestaña visible, nunca con movimiento reducido ni con ahorro de datos (comprobado también si cambian con la página abierta), y respeta la pausa manual.
- Enlace «Saltar al contenido» y escaparate recorrible con el teclado cuando se desplaza en horizontal.
- Capturas de la portada en `docs/assets/capturas/`.

### Cambiado

- La fuente Manrope se carga con `next/font/local` (precarga y respaldo con métricas ajustadas) en lugar del paquete de Fontsource; se incluye solo el alfabeto latino, que cubre el español.
- Las pegatinas usan su color mezclado con blanco para que el texto cumpla el contraste AA en todos los tonos y temas; un test lo comprueba.
- Las palabras destacadas del titular usan el degradado cobalto → fucsia, que supera 3:1 sobre el fondo en ambos temas (el degradado Escenario completo no lo cumple en tema claro); un test lo comprueba.
- La mascota se anima unas pocas veces y se detiene, en lugar de moverse sin fin.
- `TarjetaReel` recibe el ancho con la propiedad `ancho`; `className` solo añade clases.

### Rendimiento y accesibilidad

- Lighthouse móvil en local: 93 en rendimiento con la simulación por defecto (99 y LCP de 1,6 s con limitación real del navegador) y 100 en accesibilidad.

## [0.5.3] · 2026-09-26

### Añadido

- Historial de versiones en el admin (`/admin/versiones`), generado a partir de este registro de cambios: cada versión con su fecha y sus cambios agrupados por tipo, y la actual destacada.
- Cabecera común del admin con navegación entre Componentes y Versiones y la versión en curso.
- Norma del proyecto: toda versión publicada aparece en el historial del admin; un test comprueba que la última versión del registro de cambios coincide con `package.json` y `VERSION`.
- Captura del historial en `docs/assets/capturas/`.

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
