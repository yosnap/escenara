# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.9.0] · 2026-09-27

### Añadido

- **Bóveda de secretos** (ADR-0005): todo secreto se guarda cifrado con AES-256-GCM y una clave maestra propia del servidor (`ESCENARA_CLAVE_MAESTRA`), con identificador de clave en cada valor para poder rotarla. El contexto (usuario y proveedor, o clave del ajuste) va autenticado: un valor copiado a otra fila no se descifra.
- **Credenciales de IA por usuario** (BYOK, RF01) en «Tu cuenta › Credenciales de IA»: una clave por proveedor (KIE.ai y Google Gemini) con estado, pista `••••abcd`, créditos, fecha de la última prueba y acciones Añadir, Probar, Sustituir y Borrar. Solo se guarda si la prueba pasa; sustituir prueba la nueva antes de reemplazar la anterior.
- Prueba de clave sin coste y sin llamadas de más: saldo de créditos en KIE y lista de un modelo en Google, con URL fija por proveedor, 10 s de tiempo máximo y límite de pruebas por usuario.
- **Secretos de la instalación en Admin › Ajustes**, cifrados: contraseña del servidor de correo y secretos de cliente de Google y GitHub, con sus identificadores de cliente como ajustes normales y la URL de redirección que hay que registrar en cada proveedor. Un secreto guardado se muestra como «Guardada (••••abcd)» con Cambiar y Quitar, y su valor nunca vuelve al navegador.
- Campo de secreto en el catálogo de componentes (`/admin/componentes`), con confirmación por diálogo propio para quitarlo.
- `bun run boveda:recifrar`: vuelve a cifrar la bóveda con la clave maestra actual tras una rotación (la anterior se pone en `ESCENARA_CLAVE_MAESTRA_ANTERIOR`). Es idempotente y conviene ejecutarlo con el servidor parado: nada se pierde si alguien guarda a la vez, pero esas filas se quedan sin recifrar, el script las cuenta y avisa, y hay que volver a pasarlo.
- Tests: cifrado y contexto autenticado, clave maestra ausente, inválida y rotada; pruebas de KIE y Google con `fetch` simulado (nunca se llama a los proveedores); autorización de las credenciales entre usuarios; y comprobación automática de que ningún secreto aparece en las respuestas ni en la consola al guardar, probar (con éxito y con fallo) y rotar.

### Cambiado

- Los proveedores de acceso Google y GitHub se leen del panel, no de `.env`: la instancia de Better Auth se reconstruye cuando cambian (con una huella del valor cifrado, nunca del secreto). Si quitas el identificador o el secreto, su botón deja de aparecer.
- El correo usa la contraseña SMTP de la bóveda: ya se puede configurar un servidor que exija autenticación.
- Se retiran `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` de `.env`. Si todavía están, se importan **una sola vez** al panel al arrancar y se avisa, en el registro del servidor y en Admin › Ajustes, de que ya se pueden borrar; a partir de ahí manda el panel y quitar ahí una clave no la resucita desde `.env`.

### Actualizar desde la 0.8.0

- Añade `ESCENARA_CLAVE_MAESTRA` a tu `.env` con 32 bytes en base64 (`openssl rand -base64 32`) y reinicia. **Guárdala con tus copias de seguridad:** si se pierde, hay que volver a introducir todas las claves. Sin ella, Escenara arranca pero no admite credenciales.
- Haz `bun run db:backup` y luego `bun run db:migrate`: la migración crea `provider_credentials` e `installation_secrets`.
- Si usabas Google o GitHub desde `.env`, al arrancar se importan solos a **Admin › Ajustes**; después borra esas cuatro variables del archivo. **Pon primero la clave maestra:** sin ella no se pueden cifrar, así que no se importan, el acceso con Google y GitHub queda desactivado y se registra un error explicándolo. El `.env` no sirve de respaldo.
- Si tu servidor de correo pide contraseña, ponla ahora en **Admin › Ajustes › Correo**.

### Seguridad

- Ninguna respuesta del servidor ni ningún registro contiene un secreto: de un proveedor solo se conserva un código propio del resultado, nunca su texto (algunos repiten en el error la clave recibida).
- Los secretos de la instalación viven en su propia tabla, nunca en una columna en claro de `settings`.
- Un usuario no puede ver, probar, rotar ni borrar las credenciales de otro, ni indicando su proveedor; al borrar una cuenta desaparecen sus credenciales.
- La clave de Google viaja en la cabecera `x-goog-api-key`, no en la URL, para que no quede en los registros de ningún proxy.
- En desarrollo, Next ya no registra las acciones de servidor con sus argumentos: mostraba en la consola las claves y contraseñas enviadas desde los formularios.

## [0.8.0] · 2026-09-27

### Añadido

- Biblioteca de medios por usuario en `/biblioteca`: cada usuario solo ve y modifica sus archivos; lo ajeno responde como si no existiera.
- Colecciones privadas: crear, renombrar y borrar (los archivos se conservan), y añadir o quitar archivos seleccionados; un archivo puede estar en varias.
- Espacio por usuario (2 GB por defecto, configurable) con indicador de uso; quien administra no tiene límite.
- Admin › Medios: los archivos de todos con su dueño y filtro por usuario. El administrador corrige título y texto alternativo y usa la papelera; editar la imagen o borrar para siempre solo puede hacerlo quien la subió.
- Admin › Ajustes (ADR-0013): registro abierto, espacio por usuario, remitente y servidor de correo con envío de prueba, y cabecera con la IP real. **Norma: la configuración se gestiona en el panel, no en variables de entorno**; en `.env` solo queda el arranque.
- Cabecera común de la aplicación (Biblioteca, Cuenta, Admin) y barra de espacio en el catálogo de componentes.
- Tests de autorización de la biblioteca: medios y colecciones ajenos, permisos del administrador y cuota.

### Cambiado

- Los medios pertenecen a un usuario; los subidos antes de existir cuentas pasan al primer administrador.
- Se retiran `ESCENARA_REGISTRO_ABIERTO`, `ESCENARA_CABECERAS_IP`, `SMTP_URL` y `CORREO_REMITENTE`: ahora son ajustes del panel. Las claves de Google y GitHub y la contraseña del correo pasarán al panel, cifradas, en la 0.9.0.

### Corregido

- Los campos de contraseña ya no rompen la carga de la página cuando un gestor de claves (LastPass y similares) inserta su icono antes de que termine de cargar.

### Actualizar desde la 0.7.0

- Si habías cambiado `ESCENARA_REGISTRO_ABIERTO`, `ESCENARA_CABECERAS_IP`, `SMTP_URL` o `CORREO_REMITENTE`, vuelve a poner esos valores en **Admin › Ajustes** tras migrar: sin ellos se usan los valores por defecto (registro abierto, correo por `localhost:1021`).
- La migración asigna los medios sin dueño al primer administrador; si no existe ninguna cuenta, se detiene en lugar de borrar nada.

### Seguridad

- La cuota se reserva dentro de una transacción que bloquea al usuario: varias subidas simultáneas no pueden superarla.
- Los filtros de colección y de usuario se validan (404 o 400 en lugar de un error interno) y el correo de prueba no muestra detalles de la red.

## [0.7.0] · 2026-09-26

### Añadido

- Cuentas de usuario con Better Auth (ADR-0004): crear cuenta, entrar, confirmar el correo, recuperar y restablecer la contraseña, y cerrar sesión.
- Acceso con passkeys (huella, cara o PIN del dispositivo) y, si se configuran sus claves OAuth en `.env`, con Google o GitHub.
- Página «Tu cuenta»: nombre, preferencias de tema e idioma, cambio de contraseña (cierra las demás sesiones), passkeys y sesiones abiertas con opción de cerrarlas.
- Tema por usuario sin destello: la preferencia se guarda en la cuenta y el servidor la aplica al pintar, en cualquier dispositivo (RF16). El idioma se guarda y se aplica a `lang`; la traducción de la interfaz llega más adelante.
- La primera cuenta de la instalación es administradora; `ESCENARA_REGISTRO_ABIERTO=0` cierra el registro al resto.
- Límite de intentos por IP y por cuenta al entrar, registrarse, recuperar la contraseña y reenviar la confirmación; el límite por cuenta no se puede eludir cambiando de IP.
- Cerrar una sesión o retirar el rol de administrador tiene efecto inmediato en el admin, la API y la página de cuenta.
- La aplicación no arranca sin `BETTER_AUTH_SECRET`, y las páginas de cuenta y de admin no se guardan en proxies ni CDN.
- Correo local con Mailpit en `docker compose` (SMTP 1021, bandeja en `http://localhost:8421`): nada sale a internet.
- Componentes nuevos en el catálogo: tarjeta de cuenta, contraseña con mostrar u ocultar, botones de Google y GitHub, separador y avisos de resultado.
- Enlaces «Entrar» o «Mi cuenta» en la portada y en el admin.
- Tests de autorización: sin sesión no hay acceso a la cuenta, al admin ni a la API de medios; un usuario normal no entra en el admin ni puede darse el rol de administrador; preferencias validadas; registro cerrado; límite de intentos.

### Cambiado

- El admin (`/admin`) y la API de medios exigen una sesión con rol de administrador en lugar de estar disponibles «solo en desarrollo»; desaparece `ESCENARA_ADMIN_COMPONENTES`.

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
