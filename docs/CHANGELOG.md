# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.11.0] · 2026-09-27

### Añadido

- **Catálogo de proveedores y modelos** en la base de datos, sembrado desde un fichero versionado (`apps/web/src/server/proveedores/catalogo.json`). Cada modelo declara sus **capacidades** (`image_edit`, `image_to_video`, `text_to_video`, `text_generation`, `tts`, `speech_to_text`, `multimodal_review`), los **parámetros que se le han comprobado ejecutándolo** (duraciones, proporciones, resoluciones, formatos de referencia y cuántas acepta), si **tiene voz**, su **precio medido** con fuente y fecha, su **estado** (`descubierto`, `compatible`, `validado`, `retirado`), sus notas y la versión del registro.
- **Contrato de adaptadores por capacidades** (ADR-0015): `server/proveedores/contrato.ts` define qué sabe hacer un proveedor (subir referencia, crear tarea de imagen o de vídeo, consultar, estimar, probar credencial y montar la entrada de cada modelo), con **errores normalizados** (`credencial`, `saldo`, `contenido`, `limite`, `temporal`, `respuesta`). El adaptador de KIE se reescribe sobre ese contrato **sin cambiar nada de lo que hacía la 0.10.0**: mismos endpoints (`jobs/createTask`, `jobs/recordInfo`), mismos estados y mismas reglas de gasto.
- **Registro de adaptadores**: el servicio de generación ya no nombra a ningún proveedor; resuelve «capacidad + modelo» y habla con quien corresponda. Añadir un proveedor es escribir su adaptador, declararlo y sembrar sus modelos.
- **`/admin/modelos`**: catálogo filtrable por capacidad, proveedor y estado, con la ficha legible de cada modelo (qué hace, qué necesita, cuánto cuesta y cuándo se comprobó), edición de precio con fuente y fecha, cambio de estado con evidencia obligatoria para `validado`, historial de cambios (quién, cuándo, de qué a qué) y aviso de cuántos trabajos en marcha dejan su estimación caducada al cambiar un precio.
- En `/admin/modelos`, **la opción por defecto de cada capacidad se elige a mano** («por defecto en…», una por capacidad) y **no se puede retirar el modelo por defecto sin designar otro antes**: «Crear» nunca se queda sin opción. Al retirar o degradar un modelo, el motivo que se escriba queda en el historial.
- **Elección de modelo en «Crear»**, por capacidad y solo entre los que se pueden usar (`compatible` o `validado`, con precio registrado): al cambiar de modelo se vuelve a pedir la estimación al servidor, así que el coste que se ve es el de ese modelo. Un **modelo sin voz lo dice claramente y no usa «Lo que dice»**.
- **Cuatro modelos más de KIE, con lo medido de verdad** en la comparativa del 2026-09-27: `seedream/4.5-edit` (6,5 créditos por imagen, el más rápido y de más resolución), `gpt-image-2-5-flare-image-to-image` (6 a 1K, usa `input_urls`), `hailuo/2-3-image-to-video-standard` (30 créditos por clip de 6 s, **sin voz**, 768P y sin proporción configurable) y `kling/v3-turbo-image-to-video` (72 por 4 s, con voz, solo JPEG o PNG). Los dos de ADR-0009 siguen siendo los de por defecto: `nano-banana-2-lite` (4) y `veo3_lite` (60, con voz), y son los únicos `validado`.
- La imagen de referencia **se convierte al formato que acepte el modelo** antes de subirla (los fotogramas se guardan en WebP y Kling solo admite JPEG o PNG).
- Componentes nuevos en el catálogo de `/admin/componentes`: insignias de estado de un modelo, ficha de modelo, selector de modelo por capacidad y aviso de «este modelo no tiene voz».
- Tests: contrato del adaptador de KIE con **respuestas grabadas** del servicio real (entrada exacta de cada modelo, traducción de estados y los siete errores normalizados); coherencia de la semilla versionada; y, contra la base de datos, que un modelo `retirado`, sin la capacidad necesaria o inexistente no se puede elegir ni enviar, que validar exige evidencia y que **cambiar un precio caduca las estimaciones anteriores sin tocar los créditos ya consumidos**.
- Modo opcional de prueba contra el proveedor real, apagado por defecto: `ESCENARA_PRUEBA_REAL_KIE=1 bun run proveedores:prueba-real --correo tu@correo`. Solo hace las llamadas que no cuestan créditos y `bun test` nunca lo ejecuta.

### Cambiado

- **El modelo de cada trabajo ya no es una constante del código**: sale del catálogo. La estimación viaja con un **sello del precio** y la confirmación lo devuelve, así que si el precio cambia entre la pantalla y el botón el envío se rechaza y hay que revisarlo (antes solo se comparaban los créditos). Quien elige modelo **tiene que devolver ese sello**; sin elegir modelo se sigue enviando como en la 0.10.x, con el predeterminado.
- El catálogo se lee con una **caché corta de proceso** (5 s) que se olvida en cuanto quien administra lo cambia: una carga de «Crear» ya no repite la misma consulta una docena de veces.
- La duración con la que se guarda un clip en la biblioteca es la que declara el modelo, no una constante (Hailuo 2.3 hace 6 s, no 4).
- El trabajo y su seguimiento usan la credencial **del proveedor de ese trabajo**, en lugar de dar por hecho que es KIE.
- `docs/recursos/apis-y-proveedores.md` explica cómo añadir un proveedor apuntando al contrato real.

### Seguridad

- Solo quien administra cambia el catálogo, los precios y los estados: cada acción del servidor lo vuelve a comprobar contra la base de datos, no basta con que la página del admin se vea.
- A «Crear» solo viaja una **forma recortada** de cada modelo (identificador, nombre, si tiene voz, unidad, créditos, estado y duraciones). La evidencia, las notas, la fuente del precio, el identificador de la fila y la versión del registro son datos internos del admin y no salen de ahí.
- Los tests de integración que cambian configuración de la instalación **no pueden tocar la base de datos de desarrollo**: se registra cuáles son de prueba y todo borrado ancho lo comprueba antes (`exigirBaseDeDatosDePrueba`), además de abortar si ya hubiera una conexión abierta a la base real.
- Todo lo que llega del navegador se valida: el identificador del modelo se acota por forma antes de buscarlo, y los créditos, la fuente y la fecha de un precio se comprueban (nada de fechas futuras ni fuentes vacías).
- La entrada que se guarda del trabajo sigue sin llevar URL temporales del proveedor: ahora se quitan de **todos** los campos por los que pueden llegar (`image_urls`, `input_urls`, `image_url`).
- Del proveedor sigue sin conservarse su texto: los errores se guardan como motivo y código propios.

### Actualizar desde la 0.10.1

- Haz `bun run db:backup` y luego `bun run db:migrate`: la migración crea `model_providers`, `models`, `model_capabilities` y `model_catalog_changes`, amplía `model_prices` con versión y fecha de actualización, y **siembra el catálogo** con los seis modelos medidos. La semilla es idempotente y no pisa los precios ni los estados que cambies después.
- Revisa **Admin › Modelos**: los modelos por defecto siguen siendo `nano-banana-2-lite` y `veo3_lite`. Los otros cuatro llegan como `compatible` (probados de verdad, con su precio medido, sin revisión de evidencia): valídalos tú si los quieres marcar como tales.

## [0.10.1] · 2026-09-27

### Comprobado

- Primera generación real de extremo a extremo con voz: fotograma sin texto dibujado y clip de `veo3_lite` que dice la frase de «Lo que dice» con audio, 720×1280 y 4 s, terminado por el seguimiento del servidor.

### Corregido

- Los vídeos generados se guardaban en la biblioteca sin ancho ni alto, así que el visor no conocía su proporción. Ahora las medidas se leen de la cabecera del MP4/MOV al guardarlo (también en vídeos girados de móvil), y si no se puede, se usan las que mide el navegador.

### Actualizar desde la 0.10.0

- Los vídeos generados con la 0.10.0 se quedaron sin medidas: haz `bun run db:backup` y después `bun run medios:medir-videos`, que las lee de cada archivo. Se puede repetir sin riesgo.

## [0.10.0] · 2026-09-27

### Añadido

- **Crear: el primer flujo usable** en `/crear`. Eliges o subes una imagen de tu biblioteca, describes la escena, ves el coste estimado, confirmas y obtienes un **fotograma vertical** (`nano-banana-2-lite`) y, desde él, un **clip de 4 s en 9:16 a 720p** (`veo3_lite`, con el fotograma como primer fotograma). Todo se genera con **tu propia clave de KIE** (RF01) y se paga en tu cuenta del proveedor.
- Los resultados se descargan al momento (la URL del proveedor caduca) y se guardan en tu biblioteca respetando tu cuota de espacio.
- **Panel de coste en zona de claridad**: créditos estimados, tu saldo en KIE, equivalente aproximado en euros, la fuente del precio y la fecha en que se comprobó. Siempre etiquetado como estimación; el importe final es el que informa el proveedor.
- **Confirmación obligatoria antes de gastar**: nada se envía sin que el coste mostrado viaje en la confirmación (si el precio cambia entre la pantalla y el botón, se rechaza), y sin marcar la casilla **«tengo derecho a usar esta imagen»**, que queda registrada con su fecha en el trabajo. Por encima del aviso de créditos hace falta además aceptar el gasto expresamente.
- **La misma confirmación no se cobra dos veces**: cada confirmación lleva su propia clave, así que un doble clic o un reintento tras un corte de red devuelven el trabajo que ya existe en lugar de encargar otro. Si la conexión se corta al enviar, se avisa de que puede haberse enviado y se invita a mirar el historial, nunca a repetir a ciegas.
- Tope de tres trabajos en marcha por usuario, comprobado dentro de la misma transacción que da de alta el trabajo: dos envíos simultáneos no pueden pasarse del tope. Límite de envíos y de consultas por usuario.
- **Estados reales del proveedor** traducidos («en cola en el proveedor», «generando», «listo», «ha fallado», «sin respuesta del proveedor») con el tiempo transcurrido y la mascota Chispa acompañando la espera. **No hay ninguna barra de porcentaje**: solo se muestra lo que el proveedor informa.
- **Seguimiento por sondeo** (ADR-0014): el navegador pregunta con intervalo creciente (4 s → 15 s) y el servidor consulta a KIE con un mínimo entre consultas por trabajo. Límite de trabajos en curso y de envíos por usuario.
- **Los trabajos terminan aunque cierres la página:** el servidor sondea por su cuenta los trabajos en marcha de cualquier usuario (bucle cada 10 s en lotes pequeños, arrancado en `instrumentation.ts`) y, al abrir el historial, avanza antes los tuyos sin bloquear la página. Es el sustituto mínimo de la cola de 0.12.0: nada se reenvía, solo se consulta la tarea guardada, y el resultado se descarga y se guarda como si estuvieras mirando. Los recién enviados van primero, un trabajo que lleve más de 30 minutos sin terminar se deja como «sin respuesta del proveedor» (y solo tú puedes volver a consultarlo), y si tu clave ya no vale, tus trabajos se saltan sin llamar al proveedor.
- **«Lo que dice (opcional)» separado de la descripción visual:** el fotograma se genera solo con la descripción y con una instrucción explícita de no dibujar texto, subtítulos ni rótulos; la frase va únicamente al clip, que tiene voz, en el formato que Veo entiende (dos puntos, sin comillas) y también sin subtítulos en pantalla. Sale de la comparativa real de modelos: con la frase en el prompt, los tres modelos de imagen la dibujaban en la imagen y el clip la heredaba. El diálogo queda guardado en la entrada del trabajo.
- **Tras un timeout nunca se reenvía nada**: el trabajo queda «sin respuesta del proveedor» con su identificador de tarea y un botón «Volver a consultar» que reconcilia el resultado y los créditos con ese mismo identificador.
- `/crear/historial`: lo generado con miniatura, modelo, estado, créditos y enlace al archivo; al volver, un trabajo que se quedó a medias se puede reconciliar a mano.
- Tablas `generation_jobs` (embrión de `GenerationJob`, que generaliza 0.12.0) y `model_prices`, registro versionado de precios sembrado con lo medido en el prototipo de la 0.3.0: `nano-banana-2-lite` 4 créditos por imagen y `veo3_lite` 60 créditos por vídeo de 4 s. Sin precio registrado no se estima ni se gasta.
- **Admin › Ajustes › Generación**: aviso por trabajo por encima de N créditos (200 por defecto) y euros por crédito para la estimación en euros.
- Panel de coste, insignias de estado, tarjeta de espera y visor de medios en el catálogo de componentes (`/admin/componentes`).
- Guía de usuario [«Tu primer vídeo»](guias/tu-primer-video.md).
- Tests: estados de KIE (`waiting`, `queuing`, `generating`, `success`, `fail`) y parámetros de los dos modelos con `fetch` simulado; envío sin confirmación, sin credencial o sin saldo (no se llama al proveedor); timeout que deja el trabajo «sin respuesta» sin crear una segunda tarea y su reconciliación posterior; dos consultas simultáneas que no duplican la descarga ni el archivo; autorización entre usuarios; y comprobación automática de que la clave de KIE no aparece en respuestas, base de datos ni consola en ninguna fase.

### Cambiado

- La cabecera de la aplicación estrena el apartado **Crear**.
- **Los medios se ven completos, nunca recortados:** el visor (modal de datos de la biblioteca, resultado en «Crear», historial y pantalla completa) muestra cada imagen o vídeo en su proporción real, con la altura limitada por la ventana y el ancho derivado. Antes un vertical 9:16 se metía en un marco horizontal, y el vídeo se recortaba incluso a pantalla completa porque ignoraba el ajuste que se le pedía.
- La traducción de los fallos de un proveedor a códigos propios pasa a `server/proveedores/codigos.ts` y la comparte la prueba de credenciales de la 0.9.0.

### Corregido

- Las cookies de sesión llevan el prefijo `escenara`: otra aplicación con Better Auth en `localhost` (en otro puerto) pisaba la sesión y obligaba a volver a entrar. **Al actualizar hay que iniciar sesión una vez más.**

### Actualizar desde la 0.9.0

- Haz `bun run db:backup` y luego `bun run db:migrate`: las migraciones crean `generation_jobs` (con la clave de idempotencia del envío) y `model_prices`, y siembran los precios de los dos modelos.
- Para generar necesitas tu clave de KIE.ai en **Tu cuenta › Credenciales de IA**. Sin ella, `/crear` explica qué falta y enlaza a la página de cuenta.
- Revisa en **Admin › Ajustes › Generación** el aviso por créditos y el cambio a euros si tu tarifa de KIE no es la habitual.

### Seguridad

- La clave de KIE solo sale de la bóveda dentro del servidor y viaja únicamente en la cabecera `Authorization`; del proveedor no se conserva su texto (su mensaje de error puede repetir la clave recibida), solo un código propio.
- Un usuario no ve, consulta ni reconcilia trabajos de otro, ni usa una imagen ajena como referencia: lo ajeno responde 404.
- El resultado se descarga con la protección frente a SSRF de la 0.5.0 y se valida por su firma binaria antes de guardarlo.
- La entrada que se guarda del trabajo no incluye las URL temporales del proveedor.
- Las peticiones que gastan dinero exigen que el `Origin` sea el de la propia aplicación: una página ajena no puede encargar una generación con tu sesión.
- Solo se genera con una credencial que la última prueba dejó como válida, y la cuota de la biblioteca se reserva por el tamaño máximo real del resultado: un clip que no cupiera ya se habría pagado.
- Se declara en la interfaz y en la guía que la imagen de referencia se sube temporalmente al almacenamiento de KIE, accesible por enlace unas horas.
- Los tests ya no envían correo de verdad (transporte nulo inyectado en la preload de `bun test`), en lugar de saltarse el envío con una condición dentro del código de producción.

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
