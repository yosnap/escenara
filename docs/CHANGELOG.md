# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/). Reglas de versiones en `procesos/flujo-versiones-y-ramas.md`.

## [0.46.0] · 2026-09-30

**Lugares.** Un tercer tipo de contenido junto a Personajes y Productos: el sitio poco conocido que quieres usar como
escenario una y otra vez (tu calle, el bar de la esquina, un patio), con sus fotos, una **foto maestra** que entra en el
fotograma y una **declaración de derechos**. La misma persona sale en el mismo sitio escena tras escena, y los dos clips
de un podcast comparten set. Para un sitio famoso no hace falta nada: basta con su nombre. **Una migración aditiva**:
lee «Actualizar desde la 0.45.0». Las escenas sin lugar producen exactamente lo mismo que antes.

### Añadido

- **Sección Lugares** en la navegación, con listado, alta (real o animado, en uno de los estilos de la instalación),
  ficha y borrado. Las fotos son de tu biblioteca y **una es la maestra**: la única que se envía al generar. Cambiar
  fotos, maestra o descripción crea **una versión nueva**, cada trabajo guarda la que usó y las escenas aprobadas que
  usan el lugar vuelven a borrador con el motivo escrito. Un lugar ajeno responde «no existe», también al usarlo.
- **Declaración de derechos del lugar**, obligatoria para generar: de dónde son las fotos, si es un exterior o un
  interior (un interior exige declarar el permiso de quien lo gestiona), el uso, si se ve alguna marca y **que no sale
  ningún menor**. La pantalla dice que **lo declarado es responsabilidad del usuario** (Escenara no revisa las fotos).
  **No admite gente reconocible**: se retira o se cambia la foto. Se retira sola al añadir fotos o cambiar o quitar la
  maestra, y se puede revocar; desde entonces no se genera con el lugar, tampoco lo que estaba en la cola.
- **Retirar personas de una foto** del lugar, con una edición de imagen de **coste confirmado** (unos 4 créditos) por el
  mismo camino que cualquier fotograma. La foto editada entra como generada y, si salía de la maestra, pasa a serlo.
  **No se pixelan caras**: se midió que el generador copia el pixelado.
- **Candidatos de un lugar animado**, desde su descripción y su estilo, con coste confirmado; el que apruebes se marca
  como maestra. También vale una ilustración tuya.
- **Elegir el lugar y «dónde, dentro del lugar»** en «Crear» (paso de la escena), en cada escena de un proyecto
  (heredar el del proyecto, otro o ninguno) y como **lugar del proyecto**. Solo se ofrecen los del mismo acabado; el
  servidor lo comprueba y rechaza un lugar real en un proyecto animado y al revés.
- **Plano del lugar solo** en la escena: el sitio sin nadie, mudo, sin reparto ni producto y sin el consentimiento de
  nadie. Sirve de plano de situación, también en un proyecto animado.
- **Cinco controles previos nuevos**: sin declaración vigente, acabado distinto y plano solo sin maestra **bloquean**;
  lugar sin maestra y maestra que no cabe en el modelo son **avisos** que se confirman antes de pagar.
- **Jev en sombra, «Es el mismo lugar que su foto maestra»** (`lugar_fiel`), con su modo y su umbral en Admin › Ajustes ›
  Coherencia. No se comprueba si en la escena sale una persona real, y la evidencia no lleva nombres de nadie.
- **Admin › Ajustes › Lugares**: «Escenas habladas con lugar: combinar personaje registrado y fotograma situado
  (experimental)», **apagado de fábrica**. Omni acepta las dos cosas a la vez al mismo precio (medido); falta escuchar
  la voz.
- Guía nueva: [Lugares](guias/lugares.md). Decisión en el ADR-0040. Componentes nuevos en el catálogo (› «Lugares»).

### Cambiado

- **El fotograma con lugar se compone con su maestra**: C4 pasa a ser el sitio de la maestra con la descripción de la
  versión, el preset de localización no entra y lo que escribes en «dónde» manda. **El clip hereda el lugar de su
  imagen**, y convertir un clip de «Crear» en proyecto lo conserva, con su «dónde».
- **El cupo de referencias se reparte a tres bandas** con la misma cuenta en el aviso, en el envío y en el worker: al
  menos una del personaje, al menos una del producto si lo hay, la maestra si queda sitio, y el resto 3/7 entre
  personaje y producto como en la 0.35.1. El aviso de antes de pagar dice también la maestra.
- **Podcast**: un podcast es una sola escena con dos clips, así que los dos llevan el mismo lugar y la misma versión.
  En las escenas habladas con Omni el lugar viaja descrito.
- **Borrar un lugar** no borra las fotos, lo generado ni **sus declaraciones** (quedan revocadas y con el nombre del
  lugar); no se puede con trabajos en marcha que lo usan, y el worker no envía uno cuyo lugar se ha borrado (lo cierra
  sin cobro y lo dice). Las escenas aprobadas que lo usaban vuelven a borrador con el motivo.
- **El aviso de antes de pagar y el envío deciden con la misma función** si la maestra cuenta en el cupo (no en el
  clip, ni en la escena hablada, ni al meter la captura de un producto digital), y la consulta de controles devuelve
  las cifras del reparto. La consulta del paso de la captura se hace con ese paso.
- **Un «500 Internal Error» del proveedor** (el texto «internal error», o un 500 sin texto) se cuenta como fallo
  interno pasajero («vuelve a generarlo»). Un «please try again later» con saldo insuficiente o una petición inválida
  sigue sin causa conocida. Visto con Gemini Omni: no cobró y al repetirlo salió bien.
- Documento legal: nueva sección sobre las fotos de lugares, que pueden llevar personas, y a dónde se envían
  (pendiente de revisión jurídica).
- Guías ajustadas: productos (cupo a tres y producto sobre una superficie), dirigir tu clip (el sitio con un lugar),
  podcast y dualcast (set común) y por qué no puedo generar. Resultados del spike en APIs y proveedores.

### Actualizar desde la 0.45.0

- **Haz antes una copia**: `bun run db:backup`. Después, **con el worker parado**, `bun run db:migrate`.
- La migración `0062_lugares` es **aditiva e idempotente**: crea los tipos y las tablas `places`, `place_references`,
  `place_versions` y `place_declarations`; añade `projects.default_place_id`, `scenes.place_id`, `place_inherited`
  (verdadero por defecto), `place_spot` y `place_shot` (`con_reparto` por defecto) y `generation_jobs.place_id` y
  `place_version`, con sus índices y claves ajenas (`set null`: borrar un lugar no borra nada más, tampoco sus
  declaraciones, que guardan `place_name`); y el valor
  `lugar_fiel` en el tipo de las comprobaciones de coherencia. No cambia ni borra ninguna fila y volver a aplicarla no
  hace nada.
- **Reinicia el worker** tras actualizar: ahora envía la maestra del lugar detrás de las demás fotos y revalida la
  declaración antes de enviar.
- Ajustes nuevos con su valor de fábrica: `lugar_fiel` en sombra con el umbral de siempre, y el experimento de Omni
  **apagado**. No hay variables de entorno nuevas.

## [0.45.0] · 2026-09-30

**Accesibilidad y rendimiento.** Toda la aplicación se revisa con axe en la suite, se usa entera con el teclado, respeta
«reducir movimiento» sin excepciones y carga bastante menos JavaScript: la portada pasa de 217 a 161 KB y «Crear» de
374 a 313 KB (con la pantalla de error nueva incluida). El build falla si una pantalla se pasa de su presupuesto o si
es nueva y no está dada de alta. Llegan el favicon de 16 px, los iconos para instalar la aplicación y la imagen para
compartir. **Sin migración**: lee «Actualizar desde la 0.42.1». No cambia ninguna regla de coste, de consentimiento ni
de confirmación.

### Añadido

- **Comprobación automática de accesibilidad.** axe revisa en `bun test` la portada, el acceso, la biblioteca, «Crear»
  y su historial, los proyectos, la producción, la revisión, el montaje, la cuenta y el catálogo de componentes. Una
  violación seria o crítica rompe la suite.
- **Tests que miran todo el código**, no una lista: ninguna animación sin su guarda de «reducir movimiento», ningún
  control sin foco visible o con menos de 24 px, toda tabla ancha desplazable con el teclado y todas las páginas con su
  contenido principal en `#contenido`.
- **«Saltar al contenido»** en todas las páginas (antes solo en la portada).
- **Presupuesto de JavaScript por ruta.** `bun run build` termina con una tabla del JavaScript comprimido de cada
  pantalla y **falla** si alguna pasa de su tope: 200 KB por defecto, y un tope propio (lo medido más 3 KB, con su
  motivo) para las 19 que hoy la superan, que queda como deuda: la meta sigue siendo 200 KB. También falla si hay una
  **pantalla nueva sin dar de alta** en `apps/web/presupuesto-js.json`, y dice cómo hacerlo. Decisión en el ADR-0039.
- **Pantallas de error y partes que no llegan.** Si una pantalla falla al pintarse (en la raíz, «Crear», los
  proyectos, el montaje o la biblioteca), se ve la causa en castellano con «Reintentar» y «Recargar», sin detalles
  técnicos. Si lo que se carga al abrirlo (el editor de imagen, el diálogo de la biblioteca) no llega porque se ha
  publicado una versión nueva con la pestaña abierta, solo esa parte avisa y ofrece «Recargar». Y una página que no
  existe tiene su propia página, con salida a la portada.
- **Activos de Escenara:** favicon simplificado para 16 px, `favicon.ico`, iconos para instalar la aplicación (192, 512
  y enmascarable), icono de Apple, manifiesto (escrito a mano en `apps/web/public/manifest.webmanifest`) e imagen para
  compartir de 1200 × 630 (se enlaza cuando la instalación tiene URL pública). `bun run activos` genera los iconos con
  sharp; la imagen para compartir y los PNG del wordmark solo se pintan con `bun scripts/activos-marca.ts --con-texto`
  (en `apps/web`), que necesita Chrome instalado. Los ficheros ya van en el repositorio: no hace falta ejecutarlo para compilar.
- Componente `TablaDesplazable` (catálogo › «Proyectos y plan»): las tablas anchas se alcanzan con Tab y se mueven con
  las flechas.
- Guías nuevas: [Accesibilidad](guias/accesibilidad.md) (lo que se garantiza, los atajos de teclado y cómo avisar de un
  problema) y [Medir el rendimiento](procesos/medir-el-rendimiento.md) (cómo medir en Comet).

### Cambiado

- **La marca publicada no puede dejar la interfaz sin contraste en los pares reales.** Además de los tokens básicos,
  ahora bloquean la publicación los estados sobre la superficie elevada y el fondo, el contador del admin, las
  etiquetas del historial de versiones y el texto oscuro sobre la chispa (números de paso, preset elegido, «generada»).
  El texto del preset elegido y del ángulo activo, que iba con transparencia sobre la chispa, pasa a sólido: es el par
  que se comprueba.
- **Volver a una versión antigua de la marca que ya no cumple** esos pares no la publica: la restaura como
  **borrador**, con cada par que falla en sus notas y en el aviso, para corregirla y publicarla. Si ya hay un borrador
  sin publicar, no lo pisa y lo dice.
- **El icono de Apple con una marca publicada:** `/apple-touch-icon.png` lleva al icono de la marca; si la marca tiene
  logotipo pero no icono, no se sirve ninguno (nunca el de Escenara); sin marca o sin logotipos, el de Escenara.
- **«Cerrar sesión»** dice por qué no ha podido: sin conexión, versión nueva publicada (recarga la página) o el servidor
  no la ha cerrado. Solo lleva a «Has cerrado la sesión» si se ha cerrado de verdad.
- **Menos JavaScript en cada pantalla:** el parallax de la portada, la mascota y el cargador pasan a CSS (la librería de
  animación deja de cargarse fuera del catálogo); el editor de imagen y el diálogo de la biblioteca se descargan al
  abrirlos, y el cliente de autenticación, al cambiar el tema o cerrar sesión. Crear, producción y biblioteca bajan
  entre 55 y 65 KB.
- En la portada, el cartel de los vídeos se carga en diferido: en móvil eran 125 KB que competían con lo importante.
- El logotipo pinta el nombre como texto de la página: con la fuente de respaldo o con el nombre largo de una
  instalación, crece en lugar de recortarse. Los PNG del wordmark de la guía de marca se vuelven a pintar con Manrope.
- En el editor de subtítulos, cada error sale debajo de su línea y el lector de pantalla lo dice al llegar al campo.
- El encuadre del montaje explica que se mueve con las flechas; «Volver a automático» tiene un objetivo de 24 px.

### Corregido

- Casillas, interruptores, radios y selectores no tenían nombre accesible hasta que se hidrataba la página: ahora lo
  llevan desde el HTML del servidor.
- El número de la versión actual (Admin › Versiones) y el de cada escena eran texto claro sobre el degradado
  «Escenario», ilegible en el tramo amarillo (1,55:1). Ahora usan la chispa con texto oscuro.
- El contador de requisitos pendientes de «Crear» no llegaba al contraste mínimo en tema oscuro.
- Los spinners, el pulso de la etapa en curso y el salto a «Clasificar mis fotos» se movían con «reducir movimiento».
- Saltos en el orden de encabezados en los estados vacíos, la revisión, la producción y el depósito.
- «Producir las 1 escenas pendientes» dice ahora «Producir la escena pendiente».
- El contador de fotos de la colección activa de la biblioteca no llegaba a 4,5:1.
- «Saltar al contenido» deja ahora el foco en el contenido (antes solo movía la página).

### Actualizar desde la 0.42.1

- **Sin migración** ni copia de seguridad necesaria. No hay ajustes nuevos.
- **`bun run build` puede fallar ahora por el presupuesto de JavaScript**: si una pantalla pasa de su tope o es nueva y
  no está dada de alta, el error dice cuál y qué hacer. Si eso bloquea un despliegue urgente, la variable de entorno
  `PRESUPUESTO_JS_SOLO_AVISO=1` en el build lo convierte en aviso; quítala en cuanto esté arreglado (ver
  [Medir el rendimiento](procesos/medir-el-rendimiento.md)).
- Si la instalación tiene una marca publicada, revísala en **Admin › Marca**: los pares nuevos solo se exigen al
  publicar o al volver a una versión, así que la publicada sigue aplicándose; una versión antigua que no los cumpla
  vuelve como borrador.
- El icono de Apple de Escenara se mueve a `public/marca-escenara/`; `/apple-touch-icon.png` es ahora una ruta.
- Reinicia el worker tras actualizar, como siempre: esta versión no cambia la cola ni el render, pero comparte código
  con la web.

## [0.42.2] · 2026-09-30

Parche: **«Tu cuenta» ya no se rompe con «Session is not fresh»** cuando tu sesión tiene más de 24 horas. Sin migraciones y
sin cambios de precio.

### Corregido

- **La página cargaba la lista de sesiones abiertas, y Better Auth solo la entrega a una sesión reciente (menos de
  24 horas).** Con una más antigua, la página entera fallaba. Ahora «Tu cuenta» carga siempre, y el bloque «Sesiones
  abiertas» explica que hace falta haber iniciado sesión hace poco, con el botón «Cerrar sesión» para volver a entrar.
  Cerrar la sesión de otro dispositivo desde ese bloque también da el aviso en vez de romperse (la 0.41.1 solo cubría el
  cierre, no el listado previo).


## [0.42.1] · 2026-09-30

Parche: **cada plantilla y cada trend puede enseñar cómo se ve el resultado antes de gastar**, y la plantilla base que se
aplicaba sola en «Describe la escena» deja de ser invisible. Una migración aditiva: lee «Actualizar desde la 0.42.0».
No cambia ninguna regla de coste, de consentimiento ni de confirmación, y el ejemplo no cuesta créditos.

### Añadido

- **Ejemplo por plantilla y por trend.** En **Admin › Plantillas**, cada tarjeta tiene el botón **«Poner ejemplo»**
  (o «Cambiar ejemplo»): eliges una **imagen o un clip de tu propia biblioteca** (o subes uno nuevo desde ahí) y lo ves
  en la tarjeta. **«Quitar ejemplo»** lo deja como antes. No se genera nada, no llama a ningún proveedor, y ponerlo o
  quitarlo **no crea versión ni cambia el texto de la plantilla**. Solo administradores, y **solo medios del propio
  administrador que lo pone**: nunca el de otro usuario ni el de otro administrador. Tampoco valen los documentos de
  consentimiento, las fotos de un personaje ni su hoja, un archivo en la papelera ni el audio. **Y la regla de origen es
  una lista blanca, no una lista de prohibiciones**: un medio solo vale como ejemplo si es (A) una **subida directa** tuya
  que no está en ningún trabajo, escena ni personaje (tampoco en ninguna versión anterior de un personaje, aunque la foto
  se haya quitado después), o (B) el **resultado o el punto de partida de un trabajo hecho con un personaje sintético**
  (inventado, animado o una mascota) y que nunca ha sido de un reparto de varias personas (dualcast, podcast…), mirando
  todos los trabajos de la escena y no solo el vigente. Todo lo demás se rechaza, incluido lo que no se sabe de dónde
  viene. La comprobación se repite en cada lectura: si un medio deja de cumplirlo (se añade una persona real al reparto,
  por ejemplo), deja de verse. El diálogo avisa de que el ejemplo lo ven todos los usuarios y de que una foto real subida
  directamente no se puede detectar: es responsabilidad de quien la elige.
- **En «Crear»**, el ejemplo se ve en el selector «Plantilla o trend vigente» (las opciones que lo tienen lo dicen y el
  de la plantilla elegida aparece debajo) y en la **vista previa del trend**. Un clip lleva controles, va **silenciado**,
  no se descarga hasta que le das a reproducir y **nunca arranca solo**; una imagen y un clip llevan texto alternativo.
- **La plantilla que se aplica sola ahora se ve.** Cuando solo hay una plantilla para lo que vas a crear, en «Describe la
  escena» (y en el formato del clip, si no hay trends) aparece un aviso: «Se aplica la plantilla «Fotograma para
  redes»», con su ejemplo si lo tiene. Sigue sin selector, porque no hay nada que elegir, y sin mostrar el prompt.
- **En los proyectos**, el selector «Formato vigente» de «Trend del clip» marca los trends con ejemplo y, al elegir uno,
  se ve debajo de la vista previa.
- Componente nuevo en el catálogo `/admin/componentes` › «Presets y prompt»: el ejemplo de una plantilla o de un trend,
  la plantilla que se aplica sola y la vista previa de un trend con ejemplo.

### Cambiado

- Duplicar un trend conserva su ejemplo solo si sigue cumpliendo las reglas de ahora y es del administrador que duplica; si no, la copia nace sin él.

### Seguridad

- **El ejemplo no abre la biblioteca de quien administra.** Se sirve por una ruta propia
  (`/api/prompts/plantillas/{id}/demo`) que solo entrega el medio marcado como ejemplo de una plantilla que a ese usuario
  se le ofrece: activa y, si es un trend, vigente y con los trends visibles. Una plantilla desactivada, un trend
  caducado o en revisión, o con los trends ocultos en Admin › Ajustes, responde 404 a los usuarios (quien administra
  sí lo ve, para revisarlo). Lleva `X-Content-Type-Options: nosniff`, una CSP cerrada con `sandbox` y solo sirve tipos de
  imagen y vídeo (nunca SVG); admite `Range`, que los navegadores piden para reproducir vídeo. El navegador nunca recibe
  el identificador del medio ni nada del texto de la plantilla (ADR-0022).
- **Un ejemplo es un medio propio del administrador.** El servidor lo exige al elegirlo y, al servirlo, comprueba que el
  medio sigue siendo de quien lo puso y que esa persona sigue siendo administradora: si pierde el rol o el medio cambia
  de dueño, el ejemplo deja de verse. Así la ruta nunca es una puerta a la biblioteca de otra persona.
- **Sin personas reales.** Un ejemplo se enseña a todos los usuarios de la instalación, y el consentimiento de un
  personaje real no cubre eso. Si algún día se quieren ejemplos con personas reales, hará falta una declaración de
  consentimiento específica.
- Un identificador de medio mal escrito responde con su causa, y la lectura de ejemplos tiene un límite de ritmo
  (600 por minuto y usuario).
- Si un medio elegido como ejemplo pasa después a ser material reservado (una foto de un personaje, por ejemplo) o a la
  papelera, deja de servirse y de verse en el momento.

### Actualizar desde la 0.42.0

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0060_plantillas-con-ejemplo` es **aditiva e idempotente**: añade a `prompt_templates` la columna
  `demo_media_id` (el medio; si se borra del todo, la plantilla se queda sin ejemplo) y `demo_set_by` (el administrador
  que lo puso), las dos con sus claves foráneas y que admiten nulos. No cambia ni borra ninguna fila y volver a aplicarla no hace nada.
- **Sin ejemplos por defecto**: ninguna plantilla ni trend lleva ejemplo al actualizar. Los eliges tú desde Admin ›
  Plantillas, con clips o imágenes que ya tengas en la biblioteca.
- La migración `0061_indices-de-medios-de-trabajos-y-escenas` es **aditiva e idempotente** (`CREATE INDEX IF NOT EXISTS`):
  añade índices sobre las columnas de medios de `generation_jobs`, `scenes` y `montage_exports`, que la comprobación de
  origen usa en cada lectura de un ejemplo. Son índices normales (el migrador va en una transacción y no admite
  `CONCURRENTLY`); las tablas son pequeñas, pero migra con el worker parado.
- No hace falta reiniciar el worker (no cambia nada de la cola ni del render). No hay ajustes nuevos ni variables de
  entorno nuevas.

## [0.42.0] · 2026-09-30

**Branding editable.** Quien administra una instalación puede cambiar su **marca** (nombre, lema, logotipos,
tipografía y colores de los dos temas) desde **Admin › Marca**, verla en claro y en oscuro a la vez con componentes
reales y **publicarla de golpe**, con borrador, historial y revertir en un clic. Y cada creador tiene su **kit de
marca**: su logotipo en una esquina de **sus** exportaciones, sin tapar nunca la etiqueta de contenido generado con IA.
**Sin marca publicada, todo sigue exactamente igual**: el CSS, los iconos y los títulos de siempre. No cambia ninguna
regla de coste ni de consentimiento, y el kit no cuesta créditos. Una migración aditiva: lee «Actualizar desde la
0.41.0».

### Añadido

- **Admin › Marca** (`/admin/marca`): editor por secciones (textos, colores, tipografía y logotipos), la
  **previsualización simultánea del tema claro y el oscuro** con botones, campo, alertas, tarjeta, degradado y
  logotipo reales, y **Guardar borrador**, **Publicar**, **Descartar borrador**, **Revertir a la versión N** y
  **Volver a la marca de Escenara**. Cada versión publicada queda en el historial con su fecha y sus notas.
- **Validación estricta** con el esquema de `escenara.brand.json`, en el editor y otra vez en el servidor: un
  documento inválido no se guarda ni se publica, la respuesta dice **qué campo falla y por qué**, y la versión
  anterior sigue activa e intacta.
- **Contraste AA en los dos temas**: un texto por debajo de 4,5:1 sobre su fondo **bloquea la publicación**, con el
  par y la razón («Tema oscuro: textMuted sobre background da 3,21:1 y necesita 4,5:1»); los bordes, el foco y los
  colores vibrantes por debajo de lo suyo avisan.
- **Publicación atómica**: validar, comprobar el contraste, retirar la anterior, generar los iconos y publicar van en
  una sola transacción. Si algo falla a mitad no cambia nada y los archivos a medio subir se borran.
- **Activos derivados al publicar**, desde el símbolo (o el logotipo horizontal): favicon de 16 y 32 px, iconos de la
  aplicación de 192 y 512 px con su manifiesto e imagen para compartir de 1200 × 630, con sharp (ya estaba). La imagen
  para compartir usa la **URL pública** de Admin › Ajustes; sin ella no se emite (nunca una dirección `localhost`).
- **Fuentes propias autoalojadas**: WOFF2 de hasta 1 MB, con cabecera comprobada y **declaración de licencia
  obligatoria** apuntada con fecha y cuenta. Se sirven desde la instalación: ninguna descarga de terceros al cargar.
- **Logotipos** en PNG, JPEG o WebP, que se vuelven a codificar (sin metadatos y con la orientación del móvil ya
  aplicada). **Los SVG no se admiten en esta versión**: un SVG es un documento que se interpreta, y uno preparado a
  propósito de menos de 1 KB puede tener ocupado el servidor durante minutos al pasarlo a píxeles. Se rechaza al
  momento, sin procesarlo, con «Convierte tu logotipo a PNG (con fondo transparente) o a WebP».
- **Tu cuenta › Tu kit de marca** (`/cuenta/kit`): nombre, logotipo, esquina y si se aplica, con la previsualización
  sobre un **fotograma real** (tu imagen más reciente) y la etiqueta en su sitio.
- **El kit en el render de las exportaciones**, como capa opcional: el logotipo (como mucho el 20 % del ancho y el 8 %
  del alto, dentro de la zona segura del formato) va en la esquina elegida o, si cae en la franja de la etiqueta, en
  la contraria. Los subtítulos se pintan encima del logotipo y la etiqueta encima de todo. El kit se guarda con cada
  exportación al pedirla.
- Guías nuevas [Personaliza tu instancia](guias/personaliza-tu-instancia.md) y [Tu kit de marca](guias/tu-kit-de-marca.md),
  y la guía de identidad explica que los tokens de una instalación pueden diferir del `escenara.brand.json` de
  referencia.
- Componentes nuevos en el catálogo `/admin/componentes` › «Marca y kit»: la previsualización de una marca en los dos
  temas y la del kit sobre un fotograma, con la esquina que cambia para no tapar la etiqueta.

### Cambiado

- El logotipo de las cabeceras dice a los lectores de pantalla el nombre de la instalación, no «Escenara» fijo.
- Cada página pone solo su parte del título y la plantilla añade el nombre de la instalación («Tus personajes ·
  Escenara» sin marca publicada, «Tus personajes · Tu nombre» con ella). Sin marca, los títulos son los de siempre.
- El icono de Escenara pasa de `app/icon.svg` a `public/icon.svg` y se declara en los metadatos (el mismo archivo):
  el icono por fichero de Next mandaba sobre los metadatos y no dejaba poner el de una marca publicada.
- `generarCss` comprueba cada valor con las listas estrictas antes de escribir nada; `tokens.css` sale idéntico.

### Seguridad

- Todo lo que acaba en CSS se valida con listas cerradas (colores `#RRGGBB`, familias sin comillas ni signos, enteros
  en rango, claves fijas): ningún token, nombre de fuente ni texto puede inyectar CSS, HTML ni JavaScript.
- Los archivos de marca se sirven con su tipo real (solo PNG, JPEG, WebP y WOFF2), `X-Content-Type-Options: nosniff` y
  una CSP cerrada con `sandbox`. Los de un kit, solo a su dueño (lo ajeno responde 404).
- **Procesado de imágenes acotado**: tiempo máximo por imagen y como mucho dos a la vez en la instalación; con más
  subidas simultáneas se responde «espera unos segundos» en lugar de acumular trabajo. Las subidas se leen con tope de
  tamaño aunque no digan cuánto pesan.
- Los textos de marca rechazan las **marcas invisibles de dirección** (las que hacen que un nombre se lea al revés) y
  otros invisibles innecesarios, pero admiten los que sí hacen falta: emojis compuestos (👩‍💻), banderas de
  subdivisión y escrituras como el persa. Las familias no admiten palabras reservadas de CSS (`inherit`, `unset`…).
- El lector de SVG de la librería de imágenes queda **bloqueado** en el servidor, y solo se procesa lo que se lee como
  PNG, JPEG o WebP: un archivo con una firma falsa no puede colarse. Publicar también rechaza, con su causa, un
  logotipo guardado con otro tipo.
- Los logotipos del kit que se cambian o se quitan se borran en cuanto no los necesita ninguna exportación pendiente.
- La marca de la instalación solo la cambia quien administra: se comprueba en la página **y en cada operación** de la
  API, con el mismo origen exigido en las escrituras. Cada usuario solo ve y cambia su kit.

### Actualizar desde la 0.41.0

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0059_marca-editable-y-kit-del-creador` es **aditiva e idempotente**: crea los tipos y las tablas
  `brand_versions` (versiones de la marca, con una sola publicada y un solo borrador a la vez), `brand_assets`
  (logotipos, fuentes e iconos generados) y `creator_kits` (un kit por usuario), y añade a `montage_exports` la
  columna `brand_kit`, que admite nulos: las exportaciones que ya había quedan sin kit, igual que hasta ahora. No
  cambia ni borra ninguna fila. Volver a aplicarla no hace nada.
- **Reinicia el worker** después de migrar, ya con el código nuevo: el render del montaje aplica el kit del creador y
  el worker no recarga el código solo.
- No hay ajustes nuevos ni variables de entorno nuevas. Sin publicar ninguna marca, la instalación se ve igual que en
  la 0.41.0.

## [0.41.1] · 2026-09-30

Parche: **cerrar otra sesión desde «Tu cuenta» ya no rompe la pantalla con «Session is not fresh»**. Sin migraciones, sin
cambios de precio.

### Corregido

- **Cerrar una sesión abierta en otro dispositivo, o cerrar las demás, pide una sesión reciente** (norma de
  seguridad: 24 horas desde que entraste). Cuando la tuya era más antigua, el error salía como pantalla de fallo del
  servidor. Ahora se queda en «Tu cuenta» con un aviso claro: «Por seguridad, esta acción pide que hayas iniciado
  sesión hace poco. Cierra sesión, vuelve a entrar y repítela.» Vale también para cambiar la contraseña.


## [0.41.0] · 2026-09-30

**Formatos y proyectos multiescena.** Un proyecto deja de ser solo un reel vertical corto: eliges **para qué
plataforma es**, el mismo montaje sale en **9:16, 4:5, 1:1 y 16:9** reencuadrando los mismos clips **sin regenerar
nada ni gastar créditos**, un proyecto admite hasta **30 escenas y 5 minutos**, y cada escena guarda **todas las
versiones** de su clip para elegir la que entra en el vídeo. No cambia ninguna regla de coste, de consentimiento, de
confirmación ni de idempotencia, y los proyectos y exportaciones verticales que ya había salen exactamente igual.
Una migración que **no es puramente aditiva** (sustituye un índice único): lee «Actualizar desde la 0.39.0».

### Añadido

- **Selector por plataforma al generar**: «Reels · TikTok · Stories (9:16)», «Instagram feed y carrusel (4:5)»,
  «Cuadrado (1:1)» y «YouTube · horizontal (16:9)». Al crear un proyecto (y en su paso «La idea», mientras el plan
  no esté aprobado ni haya clips) eliges el **formato principal**, que es la proporción en la que se generan sus
  clips. En «Crear» es la familia **Formato** de la botonera, con los mismos nombres y una opción nueva de 4:5.
- **La proporción elegida se envía de verdad al proveedor** y queda guardada en el trabajo; el historial la enseña
  como «Formato 16:9». Hasta ahora solo se validaba y se mandaba siempre la del modelo.
- **Exportar el mismo montaje en varios formatos**: en Proyecto › Montaje, «Formatos y encuadre» con los formatos del
  proyecto (el principal no se quita; los demás se añaden sin coste), una pestaña por formato con sus **zonas
  seguras**, y en «Exportar el vídeo» la elección del formato de cada MP4 (1080 × 1920, 1080 × 1350, 1080 × 1080 o
  1920 × 1080). Cada formato es su propia exportación.
- **Encuadre por escena y formato**: se **arrastra** el vídeo dentro del marco (o se mueve con las flechas), o se
  eligen los atajos centrado, izquierda, derecha, arriba, abajo o «entero, con bandas». La previsualización usa la
  misma cuenta que FFmpeg, así que lo que se ve es lo que sale. Si un recorte deja fuera más de la mitad del plano,
  se avisa en la escena y al exportar.
- **Subtítulos quemados y etiqueta dentro de la zona segura de cada formato** (en 9:16, las mismas franjas de
  siempre).
- **La revisión de continuidad compara cada clip con el formato principal del proyecto**, no con 9:16 fijo: un clip
  bien hecho en 16:9 o 1:1 en su proyecto no sale como fallo crítico, y uno de otra proporción (por ejemplo un clip
  de «Crear» en 16:9 convertido en escena de un proyecto vertical) sale como proporción distinta.
- En «Crear», si el **fotograma generado** está en una proporción que el modelo de vídeo no sabe animar, el paso del
  clip lo avisa **antes de confirmar**, con un botón por cada modelo que sí la anima y la vía de recortarlo en la
  biblioteca. Es la misma regla que aplica el servidor, que rechaza el envío sin reservar nada. Con una imagen propia
  no se avisa ni se bloquea: se envía como siempre y el modelo la encaja.
- **Biblioteca de versiones de cada escena**, en producción: todos sus clips con miniatura, modelo, coste (el del
  proveedor o la estimación, dicho), tamaño y fecha, la que está en uso marcada y **«Usar esta»**, que cambia el
  clip del montaje **sin borrar ninguna** y sin coste. El montaje estrena versión y la revisión de continuidad de esa
  escena deja de valer, como al regenerar. Pasa las mismas puertas que convertir un clip en escena: la persona que
  sale tiene que poder usarse **ahora** (consentimiento vigente y referencias suficientes), seguir en el reparto de
  la escena (o ser el protagonista del proyecto, si la escena no tiene reparto propio), y el clip tiene que llevar
  sus declaraciones; en un dualcast con las dos personas en el plano, las dos. Si no, se dice por qué y no cambia
  nada. Las escenas de dualcast tienen biblioteca de versiones; las de podcast, no (sus clips van por turnos).
- **Aviso de cuota**: con la biblioteca por encima del 80 %, la biblioteca de versiones lo dice y cuenta cuánto ocupan
  las versiones sin usar del proyecto.
- **Admin › Ajustes › Montaje, exportación y tamaño de los proyectos**: escenas por proyecto (1–30, 30 de fábrica) y
  segundos de montaje (10–300, 300 de fábrica). Se pueden bajar, no subir por encima del techo de esta versión.
- Guía nueva [Formatos y proyectos largos](guias/formatos-y-proyectos-largos.md), y ampliadas las de montaje,
  producción, presets y «por qué no puedo generar».
- Componentes nuevos en el catálogo `/admin/componentes` › «Formatos, encuadre y versiones»: el selector por
  plataforma con un formato deshabilitado y su motivo, los formatos del montaje, el marco de cada formato, el ajuste
  del encuadre con su aviso y la biblioteca de versiones con el aviso de cuota.

### Cambiado

- El tope de escenas por proyecto pasa de 24 a **30** (decisión del propietario), y el de segundos del montaje sigue
  en 300 pero ahora es configurable a la baja. Los mensajes dicen «el máximo de esta instalación».
- La **idempotencia de la exportación** pasa a ser por montaje, versión **y formato**. Pedir sin formato sigue
  siendo el vertical de siempre, y devuelve la misma exportación que antes.
- Las opciones de formato sembradas se llaman por su plataforma. El nombre y la descripción solo se cambian si
  seguían con el texto de fábrica.
- Los MP4 que no son verticales se guardan y se descargan con su formato en el nombre («montaje-16x9.mp4»); el
  vertical conserva el de siempre.
- La toma de una exportación se renueva mientras se monta, y el recorte se hace antes de escalar: un montaje largo en
  16:9 no se queda sin toma a mitad ni lo coge otra pasada.
- El asistente de guion y el guion del anuncio no piden (ni cobran) más escenas que el máximo de la instalación.
- Pasar un proyecto a escenas habladas (Omni) comprueba que su modelo genera el formato principal del proyecto (en ese
  modo solo cuenta el modelo Omni).
- **Animar una vista del personaje** (cabeza 3:4) con un modelo de vídeo que no admite 3:4 (Veo, por ejemplo) ahora
  se rechaza con su salida en lugar de enviarse: la vista es de verdad 3:4, y pedirle 9:16 al modelo habría cambiado
  la imagen sin decirlo. Recórtala a 9:16 en la biblioteca o anímala con un modelo que la admita.
- Solo el worker que tiene la toma de una exportación renueva esa toma y apunta su progreso.
- Guardar el montaje descarta los encuadres de escenas que ya no existen, en lugar de rechazar el guardado.

### Seguridad y coste

- **Un modelo que no admite un formato no lo recibe nunca**: sale deshabilitado con su motivo, y por la API se
  rechaza antes de reservar nada. Si al despachar el modelo (o la reserva a la que se releva) ya no lo admite, el
  trabajo se cierra **sin enviarse y sin cobro**; las reservas que no admiten el formato elegido no se guardan.
- Un fotograma en una proporción que el modelo de vídeo no admite **no se anima en silencio**: se pide elegir uno de
  sus formatos. Escenara no recorta el fotograma por su cuenta.
- Reencuadrar es FFmpeg local: **ni un trabajo, ni un apunte de gasto**, y el clip de la escena no se toca.

### Actualizar desde la 0.39.0

- **Para el worker antes de migrar** (y antes de desplegar la web nueva), y arráncalo con el código nuevo después.
  Si el worker antiguo sigue en marcha con la base ya migrada, podría montar en 9:16 una exportación pedida en 16:9.
- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0058_formatos-encuadre-y-versiones-de-escena` es **idempotente pero no puramente aditiva**: añade tres valores al
  formato del montaje (`vertical_4_5`, `cuadrado_1_1`, `horizontal_16_9`), la lista de formatos de cada proyecto
  (`projects.formats`, que nace en vertical 9:16) y el mapa de encuadres de cada montaje (`montages.framings`, que
  nace vacío: el automático, igual que antes), y un índice para leer las versiones de cada escena. Sustituye el
  índice único de la exportación por uno que **incluye el formato**, creando el nuevo antes de quitar el anterior (el
  anterior era más estricto, así que ninguna fila existente lo incumple). Renombra las opciones de formato de la
  instalación **solo si siguen con el texto de fábrica**. No borra ninguna fila. **Solo se deshace restaurando la
  copia de seguridad**: los valores de un enum no se pueden quitar, y en cuanto haya dos exportaciones de la misma
  versión en formatos distintos el índice anterior ya no se puede volver a crear.
- Crea los índices sin `CONCURRENTLY`: con pocas miles de trabajos es un instante; si `generation_jobs` fuera grande,
  crea antes a mano `generation_jobs_escena_fecha_idx` con `CREATE INDEX CONCURRENTLY IF NOT EXISTS` y la migración
  lo dará por hecho.
- **Ajustes nuevos** con sus valores de fábrica (30 escenas y 300 s): no hay que hacer nada si te valen.
- **Arranca el worker** después de migrar, ya con el código nuevo: cambian el render del montaje (formato, encuadre y
  zonas seguras), el despacho de los trabajos (la proporción elegida) y la revisión de continuidad, y el worker no
  recarga el código solo.

## [0.39.0] · 2026-09-30

**Decisiones registradas y sombra.** Cada vez que los controles previos deciden si algo se genera, queda apuntado
**qué se miró, con qué umbrales y qué se hizo**. Y, si quien administra lo enciende, Jev opina en paralelo **sin
decidir nada** para poder medir si acertaría. No cambia qué bloquea ningún control ni ninguna regla de coste o de
consentimiento. Una migración aditiva.

### Añadido

- **Admin › Decisiones**: las últimas decisiones de los controles, cada una con cuándo y qué se iba a hacer, si
  **dejó pasar**, **pidió confirmar** o **frenó**, las reglas que saltaron, **qué se miró** (modelo, precio,
  créditos, presupuesto, estado de la escena; ni el texto del guion ni ningún nombre de persona o de producto, que
  se sustituyen por un marcador como «el personaje»), los umbrales aplicados y la versión de las reglas.
- **La sombra de Jev**, apagada de fábrica. Encendida, pregunta sola, por cada escena que pasa por la puerta de
  generar, **«¿el guion tiene una afirmación que exige verificación?»**. Las escenas con una **persona real** (de
  protagonista o en el reparto, tenga o no consentimiento) **no se evalúan nunca**, y en las demás se sustituyen
  antes los nombres de los personajes y del producto. La segunda pregunta que se mide, **«¿la
  escena generada corresponde a la descripción?»**, es la comprobación del resultado de Coherencia, que se sigue
  pidiendo desde la revisión.
- **Métricas de la sombra**, con **cada escena contada una sola vez** por pregunta (el fotograma, el clip y la voz de
  una escena comparten opinión): aciertos, **falsos permisos** (la sombra dejaba pasar y la persona no),
  **bloqueos innecesarios** (la sombra frenaba y la persona dejó pasar), cuántas veces coincide con **su regla
  equivalente** (la de las afirmaciones sin verificar, no la decisión entera de la puerta), coste y latencia. La
  pregunta de las afirmaciones se mide con lo que la persona resolvió sobre las **afirmaciones señaladas** en el
  guion (verificar o corregir: había que frenar; descartar: no aplicaba); sin ninguna resuelta dice «sin etiqueta
  independiente» en vez de un porcentaje. La del resultado se marca como **etiqueta no independiente**: quien la
  corrige ve el veredicto, que sigue visible en la revisión como hasta ahora. Con menos de 20 casos se enseña el
  recuento, no el porcentaje.
- **Admin › Ajustes › Decisiones en sombra**: encenderla, encender su pregunta, su confianza mínima y un tope de
  evaluaciones por usuario y día, con **lo que cuesta cada evaluación** calculado con la tarifa de Jev de Coherencia.
  Un aviso dice que, encendida, el guion y la descripción de las escenas se envían a TypeSafe como encargado del
  tratamiento (sin imágenes ni audio), y **no se puede encender sin marcar antes la casilla** que lo confirma.

### Cambiado

- **Todas las decisiones de los controles quedan registradas**, también las que antes no dejaban rastro: el tope
  del proyecto cuando frena el asistente de guion, la comprobación previa del canto y la que repite el
  consentimiento justo antes de mandar una cara al proveedor. Lo que deciden y lo que dicen es exactamente lo mismo
  que antes.

### Seguridad y privacidad

- La sombra **no frena nada nunca** y **nadie la espera**: si Jev tarda más de 10 segundos, falla o contesta algo que
  no se entiende, se apunta como fallo y la generación sigue igual. Apagada, no lee la clave ni llama a nadie.
- **El usuario no ve la opinión de la sombra**: solo la ve quien administra, para que la revisión humana con la que
  se mide siga siendo independiente.
- La clave de TypeSafe es la de la instalación, **cifrada** en la bóveda como hasta ahora; no vuelve al navegador ni
  sale en el registro del servidor, tampoco cuando TypeSafe la repite en un error. Con la sombra encendida, el
  guion y la descripción de cada escena salen hacia TypeSafe con esa clave; el mismo texto no se vuelve a mandar
  una vez guardada su opinión (dos envíos exactamente simultáneos de la misma escena aún pueden pagarlo dos veces).
  El tope diario de evaluaciones se cuenta de forma atómica, así que los envíos a la vez no lo sobrepasan.
- **Sin nombres en el registro**: los motivos de las reglas citaban entre «» al personaje, a las personas del
  reparto y al producto. Ahora se guardan con un marcador, el panel los vuelve a quitar al leer y la migración los
  quita de las decisiones ya guardadas. Borrar la ficha de una persona no deja su nombre en el registro.
- TypeSafe figura en `docs/legal/cumplimiento-y-privacidad.md` con lo que recibe y lo que no, **pendiente de
  revisión jurídica** antes de encender la sombra en producción.

### Actualizar desde la 0.36.0

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0057_decisiones-registradas-y-sombra` es **aditiva e idempotente**: añade a `control_evaluations`
  la evidencia, los umbrales, la puerta y la acción (vacíos de fábrica en las filas anteriores, que se leen igual),
  añade el sujeto «proyecto» y crea la tabla vacía `shadow_evaluations`. No borra ninguna fila. Tiene dos pasos de
  datos, también idempotentes: sustituye por «nombre oculto» los nombres citados en los motivos ya guardados (sin
  borrar la decisión) y marca con la puerta «frenos duros» las evaluaciones del montaje anteriores.
- Crea el índice `control_evaluations_fecha_idx` sin `CONCURRENTLY`: bloquea las escrituras en esa tabla mientras se
  construye. Con pocas miles de filas es un instante; si la tabla fuera grande, crea antes el índice a mano con
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS` y la migración lo dará por hecho.
- **Ajuste nuevo**: la sombra viene **apagada**. Si quieres medirla, marca la casilla del encargado, enciéndela en
  Admin › Ajustes › Decisiones en sombra y pon antes la tarifa de Jev en Coherencia para ver su coste en euros.
- **Reinicia el worker** después de migrar: es quien repite los controles antes de mandar un trabajo al proveedor,
  y no recarga el código solo.

## [0.36.0] · 2026-09-30

**Alertas visibles.** Los avisos dejan de ser líneas sueltas que pasan desapercibidas: todo bloqueo, error o aviso
sale en **una misma alerta** que se ve como tal y, cuando falta algo, **te lleva a ello**. No cambia qué bloquea
nada ni sus textos, ni ningún coste; **sin migración**.

### Añadido

- **Una alerta para todo**, con cuatro tipos que se distinguen por el rótulo y el icono, no solo por el color:
  **Bloqueo** en rojo (falta algo para seguir), **Error** en rojo (algo ha fallado; dice la causa, si se ha cobrado y
  qué hacer), **Aviso** en ámbar con un triángulo (pide atención sin bloquear: el gasto alto, «Necesita ajustes», un
  riesgo) e **Información** en azul de marca con una «i» (notas, guías, algo que se está generando, lo que decide un
  trend). Borde completo alrededor, nunca una raya de color a un lado.
- **Te lleva al problema.** Cada punto de «Antes de generar, falta:» y de la confirmación del gasto es un botón:
  cambia al paso que toca si estás en otro, desplaza la pantalla hasta el campo o la casilla, le pone el foco, lo
  rodea con un aro del color de la marca y le pone encima una **flecha que rebota** señalándolo. La flecha se quita
  a los pocos segundos, al tocar el campo o al pulsar en otro sitio.
- **Varios problemas a la vez**: la alerta los numera, destaca el primero y tiene **«Ir al primero»**.
- Si el campo al que lleva un punto ya no está en la pantalla, la alerta lo dice en una línea en lugar de no hacer
  nada.
- La alerta, sus tipos y estados (persistente, con varios puntos, con «Ir al campo» y la flecha con y sin movimiento)
  están en **Admin › Componentes › Alertas**.

### Cambiado

- **Crear**: el bloque «Antes de generar, falta:», la lista de lo que falta junto al botón de generar, el panel
  «Antes de generar» con sus comprobaciones «Necesita ajustes» y el aviso de gasto alto salen como alertas. El fallo
  de una generación y el cobro por encima del límite también, en el resultado y en el historial.
- **Lo que decide un trend** y el **modo experto desactivado** con un trend salen como alertas de información con
  un candado y su motivo de siempre (no son un error: es el trend el que manda). El motivo sigue formando parte de la
  descripción de la casilla para el lector de pantalla.
- **Proyectos**: «Para poder aprobar el plan falta esto:», «Para poder producir falta esto:», la confirmación del
  gasto de cada escena (con «Falta confirmar la revisión de las fotos del personaje» y el resto de casillas, que
  ahora llevan a su casilla), los frenos de cada escena, la nueva versión de un trend, el consentimiento que falta
  en un reparto, el estado de la exportación y la etiqueta de IA obligatoria del montaje.
- **Personajes**: lo que falta para generar retratos, la hoja de identidad y las vistas (cada casilla pendiente
  lleva a la suya), lo que falta del consentimiento y lo que impide generar con Omni.
- **Cuenta, acceso, biblioteca y ajustes**: los errores y los «Guardado» que eran una línea de color pasan a ser
  alertas.
- **Qué cambia de color.** Los avisos informativos siguen en azul, ahora con el rótulo «Información». Pasan a
  **ámbar** («Aviso») los que piden atención sin bloquear: el gasto alto, el clip que se cortará por largo, la misma
  voz para los dos personajes, la escena editada después de generarla, la revisión que te falta, las acciones de
  producto poco fiables o la cola sin nadie que la atienda. Pasan a **rojo** («Bloqueo») los que de verdad impiden
  seguir y antes salían en azul: el personaje que todavía no puede generar su hoja, la versión nueva de un trend
  que hay que guardar y la conversión a proyecto que no se puede hacer. «Requiere revisión» sigue en azul también en
  el recuadro, igual que en la insignia y en la fila de la comprobación.
- **Ninguna alerta se cierra con la X** en las pantallas: los bloqueos y errores se quedan hasta que se resuelven, y
  los avisos de gasto, derechos, consentimiento y revisión de fotos no se cierran nunca.

### Accesibilidad

- Los errores y bloqueos que aparecen al momento se anuncian una sola vez al lector de pantalla; los avisos, con
  cortesía; lo que ya estaba al abrir la pantalla no se anuncia de golpe, y una alerta sin título no se cuenta como
  «región» (el historial con varios fallos no llena la lista de regiones). La flecha no se lee (es solo visual) y los
  botones de la alerta miden al menos 44 px.
- Contraste comprobado en claro y oscuro: el rótulo de cada tipo sobre la tarjeta y sobre su círculo, por encima de
  4,5:1, y el borde, por encima de 3:1.
- La flecha sigue al campo aunque se desplace un diálogo, y desaparece al pulsar Escape, al cerrar el diálogo, al
  cambiar de pantalla o de paso y al tocar el campo.
- Con **«reducir movimiento»** en el sistema no hay desplazamiento suave, la flecha no se mueve y el aro no late.

### Actualizar desde la 0.35.2

- Sin migración ni cambios de configuración. No hace falta reiniciar el worker: solo cambia la interfaz.

## [0.35.2] · 2026-09-30

Parche de los errores: cuando el proveedor acepta un trabajo y luego no lo termina, **Escenara te dice por qué**, si
se ha cobrado y qué probar. Una migración aditiva; **sin cambios de coste** ni en lo que se confirma al generar.

### Corregido

- **El bloqueo del filtro de seguridad del proveedor se explica.** Un clip de Gemini Omni 1.1 Flash frenado por la
  revisión de seguridad de Google solo decía «El proveedor ha rechazado lo que se le pedía» y «El proveedor no ha
  podido completar la generación», así que no había forma de saber qué cambiar. Ahora dice, por ejemplo: «El filtro
  de seguridad de Gemini Omni 1.1 Flash (vídeo), en KIE.ai, bloqueó la generación (no se ha cobrado nada). No dice
  qué le ha disgustado. Prueba a: quitar el producto o usar menos fotos suyas, cambiar la descripción o generar con
  otro modelo.» Lo del producto solo aparece si el envío lo llevaba.
- **Otras causas reconocibles**, cada una con su mensaje y lo que se puede probar: las normas de contenido del
  proveedor, una imagen de referencia que no ha podido usar, el proveedor saturado y el corte por exceso de
  peticiones. Se ven en el historial de «Crear», en el resultado de «Crear» y en la escena de Producción.
- **Lo que se ha cobrado, siempre a la vista**: «no se ha cobrado nada», los créditos que el proveedor haya cobrado
  por el intento o que no ha informado de ningún cobro.

### Seguridad

- **El texto del proveedor sigue sin guardarse ni mostrarse.** Solo se lee para elegir una causa de una lista
  cerrada, con patrones estrictos; lo que no dice la causa con palabras explícitas se queda con el mensaje genérico
  de siempre, en lugar de afirmar una causa que no es. Así un proveedor que repita datos de la petición (una clave,
  por ejemplo) no los hace llegar a ningún sitio.

### Actualizar desde la 0.35.1

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0056_causa-del-fallo-del-proveedor` es **aditiva e idempotente**: añade `generation_jobs.failure_cause`
  (vacía de fábrica), que guarda solo la clave de la causa. Los trabajos anteriores se quedan sin causa y se muestran
  igual que antes; el motivo del fallo no cambia, así que tampoco cambia qué se reintenta ni qué se cobra.
- **Reinicia el worker** después de migrar: es quien consulta las tareas y cierra los fallos, y no recarga el código
  solo. Sin reiniciarlo, los fallos se siguen cerrando con el mensaje genérico.

## [0.35.1] · 2026-09-30

Parche de los productos: **el personaje recibe más referencias que el producto**, el aviso de que las fotos no caben
**dice las cifras**, y cuando el producto tiene más fotos de las que caben **eliges cuáles viajan**. Una migración
aditiva; **sin cambios de coste** ni en lo que se confirma al generar.

### Cambiado

- **Nuevo reparto de las referencias entre el personaje y el producto.** Antes el producto se quedaba con todo el
  cupo menos una imagen: con Gemini Omni 1.1 Flash (siete referencias) y una caja de cinco fotos, viajaban 5 del
  producto y solo 2 del personaje, y la identidad del personaje es lo que más pesa en el clip. Ahora el producto
  recibe **unas 3 de cada 7** referencias, con redondeo hacia abajo y **al menos una** (la frontal con la
  etiqueta), y el personaje el resto: **con siete huecos, 4 del personaje y 3 del producto**. Si uno de los dos tiene
  menos fotos de las que le tocan, el otro aprovecha lo que sobra: con un personaje de una sola foto y una caja de
  cinco, viajan 1 y 5. No cambia nada con un solo hueco (solo cabe la imagen del personaje, y el producto viaja
  descrito con palabras), ni sin producto (todo el cupo es del personaje), ni sin personaje (todo el cupo es del
  producto). Es una sola cuenta y la usan igual el aviso de antes de pagar, el envío y el worker; el trabajo guarda
  ya recortadas las fotos del personaje, así que lo que se lee en él es lo que llega al proveedor.
- **El aviso de «no caben todas las referencias» dice cuántas.** Antes: «algunas se quedan fuera». Ahora: «Gemini
  Omni 1.1 Flash admite 7 referencias: se envían 4 del personaje y 3 de «Caja Huerta Valenciana»; 2 fotos del
  producto se quedan fuera. Lo que sobra puede salir distinto.» Las reglas de los controles pasan a la versión
  `2026-09-30.2`, porque cambia el texto de una regla.
- **El aviso y el envío cuentan con las mismas fotos del personaje.** Una sola función calcula el reparto para el control
  previo, el fotograma, el clip, la escena hablada de Omni y la ficha de la escena; el worker no reparte: aplica
  `huecosDelPersonaje` sobre las fotos que el trabajo ya lleva guardadas. Antes, el control previo
  del clip contaba **todas** las fotos del personaje aunque el clip parte de una sola imagen (su fotograma), y con
  el reparto nuevo eso daba un aviso con cifras falsas y rechazaba una elección de fotos que el envío sí habría
  aceptado. Con la **hoja 3×3** del personaje viaja solo la hoja, y el aviso y el reparto cuentan una foto del personaje
  (el producto aprovecha los demás huecos); con la hoja de **prueba** (la candidata) la consulta no
  sabe de antemano de qué lado cae el envío y cuenta las fotos sueltas, así que puede avisar de una pérdida que luego
  no llega a pasar, pero nunca de menos. El aviso concuerda en número («se envía 1 foto del personaje») y dice
  las referencias que se reparten.
- **La elección de fotos vale para el paso donde la haces.** En «Crear» la elección viaja con el **clip**: el
  fotograma que lo precede se sigue generando con las fotos de por defecto, aunque hayas elegido otras para el clip,
  porque cada modelo tiene su propio tope de referencias.
- **Sin cambios de coste.** El reparto y la elección de fotos no cambian el precio del envío ni las casillas que se
  confirman: solo qué fotos de las que ya caben llegan al modelo.

### Añadido

- **Elegir qué fotos del producto viajan.** En el bloque «El producto», cuando el producto tiene más fotos de las que
  caben con el modelo del clip, aparece «Fotos del producto que se envían»: una casilla en cada miniatura, con
  cuántas caben y cuántas se envían, la frontal con la etiqueta marcada de entrada y un orden estable (las que
  eliges viajan siempre por prioridad de papel, no en el orden en que las marcaste). Si desmarcas la frontal se te
  avisa de que la etiqueta puede salir distinta. En «Crear» la elección viaja con el clip; en la escena de un
  proyecto se **guarda con la escena** y sirve en cada producción.
- **El servidor lo comprueba.** Las fotos elegidas tienen que ser fotos **vigentes de ese producto** (una ajena o una
  de la papelera se rechaza con su causa) y, en «Crear», no pueden pasar de lo que cabe. En una escena, una foto
  elegida que se borra después no rompe nada: se descarta y viajan las demás. Sin elección, todo sigue como antes:
  la frontal primero y luego el orden de siempre. Cambiar de producto en una escena borra la elección del anterior.
- **Convertir en proyecto conserva la elección de fotos, si la hubo.** El clip guarda las fotos que viajaron, no si las
  elegiste tú, así que se deduce: si son exactamente las que Escenara envía por defecto para ese clip (las primeras por
  prioridad), la escena nace **sin elección**, como cualquier otra; si son otras, hereda tu elección. Solo cuentan
  las que siguen fuera de la papelera; si no queda ninguna, la escena nace sin elección.
- **Cambiar de modelo en «Crear» ajusta la elección** en el mismo gesto, antes de comprobar el clip con el modelo nuevo,
  así que no sale un error pasajero: se recorta a lo que quepa y, si el modelo no deja sitio al producto, no se envía
  ninguna. Se parte siempre de lo que elegiste, así que al volver a un modelo con más huecos la recuperas entera. Si
  todas las fotos elegidas acaban en la papelera, no se guardan las de por defecto como si las hubieras elegido. En una
  escena el navegador no toca lo guardado: el servidor recorta y avisa. Con una elección guardada el elector se sigue enseñando aunque quepan todas las fotos, con
  «Volver a las de por defecto».
- **Catálogo de componentes**: el elector de fotos del producto, con la caja de ejemplo de cinco fotos y tres huecos.
- La guía **[Presentar un producto](guias/productos.md)** explica cuántas fotos viajan, el reparto de las referencias y
  cómo elegirlas.

### Actualizar desde la 0.35.0

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0055_fotos-del-producto-en-la-escena` es **aditiva e idempotente**: añade `scenes.product_photo_ids`
  (una lista de identificadores, vacía de fábrica). Vacía significa «las de por defecto», así que toda escena anterior
  envía exactamente lo mismo que antes, salvo el nuevo reparto de referencias.
- El worker no necesita reiniciarse: envía las fotos que el trabajo ya lleva guardadas.

## [0.35.0] · 2026-09-30

**Convertir en proyecto.** Un clip hecho en «Crear» ya puede seguir en un proyecto para ponerle voz en off y montarlo,
**sin volver a generarlo y sin volver a pagarlo**. Y cualquier escena producida puede quitar el audio que trae su clip
en el montaje y en el MP4. Una migración aditiva; sin cambios de precio ni en lo que se confirma al generar.

### Añadido

- **«Convertir en proyecto»** en el resultado de un clip terminado de «Crear». Crea un proyecto de **una escena** cuyo
  clip producido es **ese mismo clip** (el mismo archivo y el mismo trabajo, con su modelo y su coste), con la imagen de
  partida, el trend, la dirección, el producto y su acción, el personaje, el diálogo, el acento y la duración con la
  que se generó (si no es una de las de un proyecto, 8 s). Lleva al paso **Escenas** del proyecto. No llama a ningún
  proveedor ni apunta ningún gasto.
- **El gasto cuenta una vez.** Lo que costó el clip sigue en tu historial de créditos como estaba y entra en lo gastado
  del proyecto, así que su techo de gasto se compara con ello al regenerar. El techo nace en el de fábrica y, si
  este fuera menor, en lo que ya costó el clip, para que el proyecto no nazca pasado de su techo.
- **Un clip se convierte una vez.** Si ya se convirtió, el botón pasa a «Abrir su proyecto»; pedirlo dos veces a la
  vez lleva al mismo proyecto.
- **El botón nunca se oculta**: si no se puede convertir dice por qué (en curso, fallido, sin archivo, personaje con
  el consentimiento revocado o sin fotos suficientes, imagen de partida en la papelera, declaración que falta). El
  motivo va asociado al botón desactivado para los lectores de pantalla. Un trend que ya no está vigente no
  impide convertir: se avisa y la escena lo sigue citando.
- **«Quitar el audio del clip»**, por escena, en el bloque nuevo «Clips ya producidos» del paso Escenas de cualquier
  proyecto. La escena entra en el montaje y en el MP4 sin el sonido de su clip; no toca el archivo y no cuesta nada.
  La tarjeta dice qué se va a oír y cómo ponerle **voz en off** (la pista de voz aparte de «Voz y subtítulos»).
- En el montaje, el fragmento de una escena con el audio quitado lo dice («Sin el audio del clip»).
- **Una afirmación sobre salud sin verificar impide exportar** el MP4, con la escena y qué hacer. Es la misma regla
  que impide aprobar el plan y se aplica a **todo montaje**, no solo a los clips traídos de Crear: en cualquier
  proyecto, editar el texto de una escena después de aprobar el plan puede crear una afirmación de salud nueva, y
  también bloquea exportar hasta verificarla, corregirla o descartarla. Las reglas de los controles pasan a la versión
  `2026-09-30.1`.
- **Catálogo de componentes**: sección «De Crear a un proyecto» con el botón en sus cuatro estados y la tarjeta del
  clip producido.
- Guía nueva **[De Crear a un proyecto](guias/de-crear-a-un-proyecto.md)**; «Tu primer vídeo», «Voz y subtítulos» y
  «Montar y exportar tu vídeo» lo enlazan.

### Cambiado

- **Quitar el audio del clip es por escena e independiente del modo de voz**, que sigue siendo uno por proyecto: en
  «voz del clip» la escena queda sin voz; en «pista de voz aparte» se oye solo su pista. Cambiarlo sube la versión del
  montaje, así que la exportación anterior deja de ser «la del montaje de ahora» y la siguiente es un MP4 nuevo.
- **Lo que se subtitula es lo que se oye.** Una escena con el audio del clip quitado y sin pista de voz aparte no se
  transcribe del clip ni lleva subtítulos en el fichero adjunto ni quemados; su tarjeta dice «Sin subtítulos: el audio
  está quitado». Con pista de voz aparte, sus subtítulos siguen saliendo del diálogo.
- El aviso de **dos voces** al pasar a «pista de voz aparte» ya no cuenta las escenas con el audio del clip quitado, y
  ofrece quitarlo (gratis) además de volver a producir.
- El enlace **Montaje y exportación** de la cabecera del proyecto sale en cuanto hay un clip producido, también con el
  proyecto en borrador.

### Lo que el proyecto vuelve a pedir

- Al convertir se comprueba que el personaje se puede usar **ahora** y que el clip lleva sus declaraciones (derechos
  de la imagen, revisión de fotos si hay personaje, marca si hay producto). No se hereda nada a ciegas.
- El proyecto nace **en borrador** aunque su escena ya esté producida (el plan no está aprobado y es lo que impide
  gastar sin aprobarlo), en modo «voz del clip» y sin pista de voz aparte. Montar y poner voz no necesitan
  aprobar el plan; **regenerar** la escena sí, y al producir se vuelven a pedir las casillas y el coste como en
  cualquier escena.

### Actualizar desde la 0.34.1

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0054_quitar-audio-del-clip` es **aditiva e idempotente**: añade `scenes.clip_audio_muted` (sí o no,
  `false` de fábrica), así que toda escena anterior suena exactamente igual que antes.
- Reinicia el worker después de actualizar: el render del montaje lee la columna nueva.

## [0.34.1] · 2026-09-30

Parche de los productos: **el aviso de que el modelo no admite la foto del producto sale ya junto al selector de
producto**, y el selector de modelo dice cuáles sí la llevan. Sin migraciones, sin cambios de precio y sin cambios en
lo que se confirma: el control previo de antes del coste sigue igual, con su casilla «Lo he leído y quiero generar
igualmente», y Escenara sigue sin cambiar de modelo por su cuenta.

### Cambiado

- **El aviso sale donde eliges el producto.** Con un producto que tiene fotos y un modelo de clip que no admite su foto
  (Veo, cuya segunda imagen es el último fotograma), el bloque «El producto» dice ahí mismo la causa y qué hacer: «X no
  admite la foto del producto: viajará descrito con palabras y su etiqueta puede salir distinta», con los modelos que
  sí la admiten, o «Hoy no hay ningún modelo activo que la admita». Antes solo aparecía al final, junto al coste. Es
  el mismo bloque en «Crear» y en el editor de escena de un proyecto.
- **El selector de modelo del clip lo indica.** Con un producto elegido, cada modelo dice «Admite la foto del
  producto» o «El producto viaja solo descrito» en su descripción, junto al coste, el estado y la voz. No se
  deshabilita ninguno; sin producto, el selector queda como estaba.
- **Una sola fuente de verdad.** Si un modelo admite la foto lo calcula el servidor con el mismo reparto de
  referencias que aplica el control previo, y el navegador solo lo lee: el aviso del selector y el de antes del coste
  no pueden discrepar.

### Corregido

- **El aviso de antes del coste ya dice qué modelos sí admiten la foto del producto.** La tarjeta «Necesita ajustes»
  de «Crear» decía «Hoy no hay ningún otro modelo disponible que acepte la foto del producto» aunque Gemini Omni,
  Gemini Omni 1.1 Flash y MiniMax H3 sí la admiten: la lista de modelos no se le pasaba a ese aviso. Ahora lo
  completa con los mismos nombres que el aviso junto al selector de producto, para un clip o para un fotograma.
- **En el editor de escena, el aviso habla del modelo con el que de verdad se produce.** En un proyecto de escenas
  habladas con Omni se calcula con Omni y no con el modelo de vídeo por defecto, así que ya no da una falsa alarma
  (ni una falsa tranquilidad).
- **Un producto con todas sus fotos en la papelera ya no avisa de que el modelo no admite su foto:** solo cuentan las
  fotos que se enviarían de verdad.
- **Los dos avisos hablan siempre del mismo modelo.** Si cambiabas de modelo o de producto dos veces seguidas, la
  respuesta lenta de la primera comprobación podía llegar la última y dejar un aviso del modelo anterior; lo mismo si
  cambiabas de producto mientras terminaba el fotograma. Ahora solo cuenta la última comprobación pedida, y cada
  refresco usa el modelo y el producto vigentes en ese momento.

### Catálogo de componentes

- «Producto y acción» gana el aviso con alternativas, el aviso sin ninguna y el selector de modelo con un producto
  elegido.

## [0.34.0] · 2026-09-30

**Los trends ya no fijan la duración y deciden la parte de la dirección que su texto ya dicta.** Hasta ahora cada
trend exigía una duración concreta (por eso hubo que duplicar trends en variantes de 5 s) y la dirección del clip
volvía a preguntar el plano o la cámara que la plantilla ya decía. Sin cambios de precio, de confirmación, de
consentimiento ni de idempotencia.

### Añadido

- **Duraciones admitidas.** Cada trend declara las duraciones con las que se puede usar. **Vacío = cualquiera**: la
  duración la elige el modelo en «Crear» y la marca el proyecto en una escena. Con valores, solo se ofrecen esas; si
  el modelo no tiene ninguna, Escenara cambia solo a uno que sí (como en la 0.33.1) o dice por qué no puede. Si se
  pide otra, el error dice qué admite el trend y qué se pidió, y **no se reserva nada**.
- **«La dirección decide».** Cada trend declara qué partes de la dirección del clip dicta su texto: plano, ángulo,
  movimiento de cámara, micro-acción o registro estético. Con ese trend elegido, esos controles no se preguntan: en
  su lugar sale un bloque **«Lo decide el trend «X»»** con la lista y el motivo, en «Crear» y en el editor de escena.
  El resto (acento, matiz de voz, instrucciones escritas, producto…) sigue siendo tuyo.
- **El servidor aplica la misma regla**: lo que decide el trend no llega al modelo aunque venga en la petición (un
  navegador antiguo o una petición manipulada), así que nunca hay dos cabeceras de cámara ni dos reglas que se
  contradigan.
- **Admin › Plantillas**: el diálogo del trend gana «Duraciones admitidas» (segundos separados por comas; vacío =
  cualquiera) y el grupo de casillas «La dirección decide», con ayuda. Cambiar cualquiera de los dos crea una
  **versión nueva con su motivo**, igual que cambiar el texto o el permiso de habla.
- **Catálogo de componentes**: el bloque «Lo decide el trend» y los dos campos nuevos del admin.

### Cambiado

- **La duración objetivo pasa a ser un dato histórico.** Se conserva en la base de datos y en el admin se lee como
  «Se diseñó para N s», pero ya no limita nada ni se enseña a quien crea. La tarjeta del selector de trends solo
  dice la duración («· 6 s») cuando el trend la limita.
- **Con un trend elegido**, la dirección no pide la voz si el trend no permite habla y el modo experto sale
  desactivado con el motivo (el servidor ya lo rechazaba).
- **Los trends de la instalación pasan a admitir cualquier duración** con una versión nueva y su motivo; la anterior
  queda en el historial. Qué decide cada uno de fábrica (solo lo que su texto dicta de forma explícita):

  | Trend | La dirección decide |
  | --- | --- |
  | Unboxing en primera persona | Plano, ángulo y movimiento de cámara |
  | Antes y después de una rutina | Movimiento de cámara |
  | Producto en la rutina de la mañana | Micro-acción |
  | ASMR con el producto | Plano y micro-acción |
  | Mano que muestra el producto en un giro | Movimiento de cámara y micro-acción |

  Un trend que **restringe los modelos** (como las variantes de 5 s para MiniMax H3) conserva su duración y su
  restricción, pero recibe lo mismo que decide su original si tiene el mismo texto. Los trends caducados no se tocan;
  los que hubieras editado a mano se liberan de duración pero no reciben categorías decididas. Si duplicas un trend
  caducado de antes de esta versión, la copia hereda su duración fija: vacía «Duraciones admitidas» al revisarla.
- **Una escena que cita una versión antigua de su trend** ya no dice solo «el trend ha cambiado»: al producirla se
  explica que hay una versión nueva, qué puede cambiar y que basta con revisar la dirección y pulsar «Guardar escena»;
  no se cobra nada. El editor de la escena lo avisa antes.
- Con un trend que no deja hablar o que dicta el plano, el ángulo o la cámara, el clip ya no se describe como «una
  persona hablando a cámara», que contradecía al texto del trend. Sin trend, el prompt es exactamente el de antes.

### Actualizar desde la 0.33.3

- **Haz antes una copia**: `bun run db:backup`. Después, `bun run db:migrate`.
- La migración `0052_trends-libres` es **aditiva**: añade `allowed_seconds` y `decided_direction` a las plantillas y a
  sus versiones, y rellena las duraciones admitidas de cada trend con la duración que ya exigía, así que por sí sola
  no cambia nada. `target_seconds` no se borra ni se renombra.
- La migración `0053_trends-sin-duracion-fija` libera la duración de los trends de la instalación **creando una
  versión nueva con motivo** y rellena «La dirección decide» según la tabla de arriba. Es idempotente. Los trabajos
  ya generados no cambian (guardan su versión y su prompt final). **Solo** las escenas en borrador sin nada elegido
  en lo que ahora decide su trend pasan a citar la versión nueva (su prompt no pierde nada de lo que elegiste). Las
  aprobadas, las producidas y las que tienen algo elegido ahí siguen en la versión anterior: al producirlas se te
  dice que el trend tiene una versión nueva, sin cobrar, y se actualizan guardando la escena.
- Revisa en **Admin › Plantillas** los valores de «La dirección decide» de cada trend antes de publicarlos.

### Corregido

- **El aviso «Necesita ajustes» ya se actualiza al cambiar de modelo con una imagen propia.** Hasta ahora solo se
  volvía a evaluar cuando el clip salía de un fotograma generado, y con una imagen tuya seguía hablando del modelo
  anterior (por ejemplo, «Veo 3.1 Fast no admite la foto del producto» cuando ya habías elegido otro).

## [0.33.3] · 2026-09-30

Parche de diseño: **las tarjetas de opciones son más limpias**. Sin migraciones, sin cambios de precio y sin tocar
qué se envía al modelo.

### Cambiado

- **Cada tarjeta tiene dos filas: el icono con el título, y debajo la descripción.** Ya no hay un círculo de radio
  que estorbe. Sigue siendo una elección única que se maneja con el teclado y con el lector de pantalla, y la
  opción elegida se distingue por el borde, el fondo y una marca de verificación, no solo por el color. Afecta a
  todas las tarjetas de la dirección del clip (plano, ángulo, cámara, gesto…), a la acción de producto y al origen
  de «Crear».

### Corregido

- **El desplegable del producto ya no se sale del formulario.** Su lista se estiraba hasta la descripción más larga y
  tapaba media pantalla. Ahora nunca es más ancha que el hueco disponible ni que el mayor entre su campo y 28 rem, y
  las descripciones largas se parten en varias líneas. Afecta a todos los selectores con descripción.

## [0.33.2] · 2026-09-30

Parche de pulido de la **dirección del clip y del producto**, en «Crear» y en la escena de un proyecto. Solo cambia
cómo se ve y cómo se explica: sin migraciones, sin cambios de precio y sin tocar qué se envía al modelo.

### Cambiado

- **Cada grupo tiene una cabecera que se ve.** «Plano», «Ángulo», «Movimiento de cámara», «Cuándo ocurre el gesto»,
  «Qué se hace con él», «El producto», «El fotograma» y «Escríbelo tú» llevan ahora icono, un título grande y en negrita
  con color y una explicación legible debajo, y hay bastante más espacio entre grupos y dentro de las tarjetas.
  Cada familia de grupos tiene su tono (cámara y gesto, producto, fotograma y texto propio) para que no cansen. Los
  colores son los de la marca con contraste comprobado en claro y en oscuro.
- **Cada tarjeta dice una sola cosa.** Antes salían dos frases casi iguales seguidas («Lo gira hacia la cámara con la
  etiqueta de frente, para que se lea.» y debajo «Lo gira hacia la cámara con la etiqueta de frente.»). Ahora sale una:
  la descripción del catálogo (la que se corrige en Admin › Presets) y, si la opción no la tiene, la frase del dibujo.
  Lo mismo en «¿De dónde sale el clip?».
- **El catálogo de componentes** (Admin › Componentes) enseña las cabeceras, el elector con partes y una sección nueva,
  **Producto y acción**.

### Corregido

- **La acción del producto es una sola elección y ahora se ve así.** Moda, cuidado de la piel y «Con el producto en la
  mano» eran la misma lista partida en tres campos que parecían independientes: elegir algo en «Moda» desmarcaba lo
  elegido arriba sin explicación. Ahora hay una frase que lo dice, un resumen **«Elegida: Abrirlo»** que cambia al
  elegir en cualquier parte y las tres familias son partes de la misma lista, con su subtítulo.
- **Moda y cuidado de la piel ya no salen siempre.** Un producto no dice si es ropa o cosmética y no se adivina por el
  nombre, así que esas dos familias van en un bloque **«Más acciones (moda, cuidado de la piel)»**, cerrado al empezar,
  que se abre solo si la acción elegida es de ellas, aunque llegue por otro camino (cambiar de producto o aplicar una
  dirección guardada), y **no se puede cerrar mientras siga elegida**: así la elección nunca queda escondida. Cerrado,
  las tarjetas de moda y de piel no existen en la página, de modo que con el teclado (Tab y flechas) solo se recorre
  lo que se ve.

### Documentación

- Referencias a versiones futuras en la documentación y los comentarios del código puestas al día con la hoja de ruta:
  formatos 16:9 y 1:1 en la 0.41.0, revisión legal y metadatos C2PA en la 0.46.0, piloto e instancia pública en la
  0.48.0. No cambia lo que hizo ninguna versión ya publicada.
- Guías «Dirigir tu clip» y «Productos» al día con las cabeceras, la línea única y la lista de acciones.

## [0.33.1] · 2026-09-30

Parche de «Crear»: **un campo que faltaba, los requisitos a la vista y el trend que ya no falla por el modelo**. Sin
migraciones, sin cambios de precio y sin cambios en cómo se confirma o se cobra nada: los mismos requisitos apagan el
mismo botón que antes; ahora además te dicen dónde se arreglan.

### Corregido

- **Con una imagen tuya y un trend, ya hay dónde escribir lo que pide.** La confirmación decía «Falta «Qué ocurre en
  la escena»» y en ese camino no existía ningún campo para escribirlo (el texto se escribía en el paso «Describe la
  escena», que con una imagen tuya no sale). Ahora el paso del clip enseña un campo con el nombre de la variable y su
  ayuda. Es la **misma descripción** que la del paso de la escena, así que nunca hay dos textos que diverjan, y donde
  ese paso existe el campo no se repite.
- **Elegir un trend ya no falla por el modelo.** El trend fija los segundos del clip y el modelo por defecto (por
  ejemplo Veo 3.1 Fast, que solo tiene clips de 4 y 8 s) no tenía precio para 6 s: salía «no tiene precio para un clip
  de 6 s» antes de poder elegir modelo, el trend no se aplicaba y el aviso rojo se quedaba aunque luego eligieras otro
  modelo. Ahora, si el modelo no tiene tarifa para la duración del trend, Escenara cambia **solo** a un modelo
  compatible (de imagen a vídeo, usable, con tarifa para esos segundos y admitido por el trend; conserva la voz si el
  tuyo la tenía y, si no, prefiere el predeterminado), recalcula la estimación con él y te lo dice: «Hemos cambiado a X
  porque Y no tiene clips de N s». También cambia si el trend no admite tu modelo (sus «Modelos permitidos») aunque
  ese modelo sí tenga tarifa. Si ningún modelo sirve, el error dice la causa, el trend no se aplica y no se cobra
  nada. El aviso de error de un intento anterior se limpia al aplicarse el trend.
- **Al quitar el trend vuelves a tu modelo.** Si el cambio fue automático, «Sin trend» o la plantilla normal restauran
  el modelo que tenías antes (y lo dicen); si después del cambio elegiste otro modelo a mano, no se te toca.
- **Dos trends seguidos ya no se pisan**: solo vale la última elección, y una respuesta lenta de la anterior no cambia
  el modelo, los controles ni los botones.
- **Con una imagen tuya, un texto de 1 a 9 caracteres se avisa antes de enviar** («Escribe al menos 10 caracteres en
  «…»»), marcado en el campo. Es la regla que ya aplicaba el servidor; vacío o de 10 en adelante no cambia nada.
- **Las casillas de derechos del fotograma se desmarcan al cambiar de camino** (fotograma ↔ imagen tuya). Además, al
  cambiar la imagen o el personaje se desmarcan los derechos, y al cambiar el precio (otro modelo, duración o trend) el
  aviso de gasto: aceptar un gasto alto no vale para otro importe.
- En el selector de modelo del clip, los modelos sin tarifa para la duración del trend **siguen en la lista**, marcados
  como no disponibles y con el motivo.

### Añadido

- **Requisitos a la vista y señalados.** Arriba del paso del clip y del de coste sale el bloque **«Antes de generar,
  falta:»** con cada punto como botón: cambia al paso que toca (no abre uno bloqueado: dice por qué), desplaza y enfoca
  el campo o la casilla y lo resalta (con el movimiento reducido en tu sistema, el resaltado es un aro fijo y sin
  animación).
- **El campo o la casilla pendiente se marca cuando toca, no al abrir el paso**: aro de error completo, `aria-invalid` y,
  debajo, lo que falta, después de salir del paso, de pulsar «Ir al campo» o de pulsar el botón de generar con algo
  pendiente (que además te lleva al primero). Vale para la descripción de la escena, los botones de la plantilla, el
  modelo, la revisión de las fotos, el panel «Antes de generar» y las casillas de derechos (imagen, marca) y de aviso
  de gasto. El botón de generar sigue sin enviar nada mientras falte algo; ahora se puede pulsar para que te lo señale.
- **La barra de pasos cuenta lo que falta** en cada paso que se puede abrir («Faltan 2», y lo lee el lector de pantalla).
- El catálogo de componentes (**Admin › Componentes › Requisitos pendientes**) enseña el aviso de requisitos (reutilizable
  en `components/ui/requisitos.tsx`), el campo y la casilla marcados y la barra con pendientes.

## [0.33.0] · 2026-09-30

**«Crear» y la página de un proyecto van de paso en paso**, con una barra arriba y los botones Anterior y
Siguiente abajo: se acabó bajar por una página larguísima. Sin migraciones, sin cambios de precio y sin cambios en
cómo se confirma o se cobra nada.

### Añadido

- **Barra de pasos** en «Crear» y en cada proyecto: cada paso con su número, su título y su estado escrito
  (hecho, en curso, pendiente o bloqueado), y el actual resaltado. Solo se ve el contenido del paso en el que
  estás. Puedes volver con un clic a cualquier paso ya hecho o visitado; los que dependen de otro salen con un
  candado y, al pulsarlos (o al pulsar «Siguiente»), dicen qué falta. En móvil la barra se queda en círculos y
  una frase dice «Paso 3 de 6» con su título.
- **El paso queda en la dirección** (`?paso=`): al recargar o compartir el enlace se abre el mismo paso, sin tocar
  los demás parámetros (como el personaje con el que llegas a «Crear» desde su ficha).
- El catálogo de componentes (**Admin › Componentes › Flujo por pasos**) enseña la barra con sus cuatro estados.

### Cambiado

- **«Crear»**: formato → origen → a quién generas → describe la escena → revisa el coste y confirma → resultado
  del fotograma → el clip. Con una imagen tuya solo quedan formato, origen, imagen de partida y clip.
- **El formato del clip va primero.** El selector «Plantilla o trend vigente» sale del paso del clip y pasa a ser
  el paso 1, «Elige el formato», con la vista previa del trend: un trend fija la duración (y su coste) y si se
  habla a cámara, así que se decide antes que lo demás. Elegirlo sigue pidiendo al servidor la estimación con la
  duración del trend, avisa si el modelo no tiene tarifa para ella y quita la frase si el trend no permite
  hablar, igual que antes. El paso del clip ya no repite el selector. Si la instalación no tiene ningún trend
  publicado, «Crear» se abre en «¿De dónde sale el clip?» y el de formato explica por qué no hay trends; si solo hay
  una plantilla para el clip, el paso de formato no sale en la barra. El coste se desbloquea al
  describir la escena, el resultado al confirmar el fotograma y el clip cuando hay imagen de la que sacarlo. Al
  pulsar «Generar fotograma», la pantalla pasa sola a su resultado. El resumen de coste, las casillas y el botón de
  confirmar son los mismos que antes: solo cambian de sitio.
- **Proyectos**: brief → idea → escenas → aprobación. Un proyecto se abre donde está el trabajo (la aprobación si
  el plan ya está aprobado, las escenas si ya hay guion…). La aprobación está bloqueada mientras no haya escenas.
- Cambiar de paso **no pierde nada**: un fotograma o un clip generándose, una escena abierta a medio editar o un
  orden de escenas sin guardar siguen igual al volver.
- **No se aprueba un plan con cambios sin guardar en «Escenas»** (orden pendiente o una escena editada): ahora que
  están en otro paso, «Aprobación» lo dice con su motivo y bloquea el botón hasta guardarlos o descartarlos, y
  «Escenas» sale «en curso». Cada escena editada enseña «Cambios sin guardar» y un botón «Descartar cambios».
- Si el fotograma falla, se cancela o el proveedor no responde, el paso del clip lo dice (con qué hacer para pedir
  otro) y el de coste vuelve a «pendiente».
- Un paso al que aún no has llegado se puede enfocar y, al pulsarlo, recuerda que se avanza con «Siguiente». El aviso
  de un paso no disponible desaparece al cambiar de paso o en cuanto se puede abrir.
- En móviles estrechos la barra se desliza en horizontal en lugar de encoger los botones por debajo de 44 px.
- Las guías de tu primer vídeo, trends (el trend se elige en el primer paso), dirección del clip, estrategia del anuncio, asistente de guion y productos
  explican la barra en lugar de «bajar hasta» un paso.

### Corregido

- En «Crear», con una imagen tuya, los errores (al elegirla, al pedir el coste o al animar el clip) ya se ven en
  pantalla con su causa: antes solo se mostraban en el camino de generar un fotograma.

## [0.32.2] · 2026-09-30

Parche: **el orden se cambia arrastrando en cinco listas más** y **seis textos de la pantalla dejan de contar
algo que no era cierto**. Sin migraciones y sin cambios de precio.

### Corregido

- **El selector «Plantilla o trend vigente» ya no desaparece en el paso del clip de Crear.** Si la plantilla normal
  estaba elegida y la dirección del clip ya cubría todo lo que ofrece, el panel entero se ocultaba y con él la forma
  de pasar a un trend. Ahora se ocultan solo los campos repetidos y el selector se queda.

### Cambiado

- **Arrastrar y soltar (con teclado y lector de pantalla, como en el montaje)** en las plantillas y los presets
  del admin, en las recomendaciones de modelos, en las escenas del plan y en los turnos del diálogo. Plantillas y
  presets se ordenan **dentro de su capacidad o categoría**: al soltar, una sola acción recibe el orden completo del
  grupo, comprueba que son exactamente sus elementos y lo renumera de 10 en 10 en una transacción, sin empates.
  Subir y Bajar siguen en presets, modelos recomendadas y escenas, y **intercambian con la vecina**; en **Admin ›
  Plantillas** se ordena solo arrastrando (o con el teclado). El campo «Orden» de los formularios desaparece: lo
  nuevo va al final de su grupo. Los botones de las plantillas ganan color (cobalto edita, cian duplica, fucsia
  consulta versiones y mandarina caduca) para que la fila pese menos.
- **Las escenas del plan no guardan el orden al soltar**: aparece «Orden sin guardar» con «Guardar orden» y
  «Descartar». El aviso dice qué cambia antes de guardar: reordenar no quita la aprobación de ninguna escena ni
  repite ni cobra nada, y los clips ya producidos se quedan como están; cambian los números de escena, cuál abre
  el vídeo y el orden que se propone al montar. El gancho está escrito en la escena que era la primera y no se
  traslada. Borrar una escena con el orden pendiente conserva el orden de las demás.
- **Subir y Bajar** devuelven el foco al control que se estaba usando (aunque el elemento cambie de sitio o se quede
  sin ese botón) y dicen la posición nueva; las listas ordenables son ahora listas ordenadas, para que un lector de
  pantalla oiga «3 de 5». El aviso «Orden sin guardar» se anuncia aparte de sus botones.
- **Duplicar un trend** ya no hereda el orden del original: la copia va al final de su capacidad.
- Al editar una plantilla sin cambiar su orden ya no se reescribe el número, así que una reordenación a la vez no
  se pisa.

### Corregido

- **El parecido solo cuenta para la cobertura en modo Activa.** Hasta ahora, en sombra también decidía si una vista
  generada cubría; ahora en sombra se comprueba, se guarda y se enseña, pero no decide nada (la ficha del personaje
  lo dice). La revisión de una escena lo cuenta con exactitud: allí ninguna comprobación decide, ni siquiera el
  parecido.
- En Admin › Ajustes › Coherencia y en Admin › Coherencia, «Activa» ya no promete lo mismo en las ocho: «Activa
  (decide la cobertura)» para el parecido y «Activa (todavía solo informa)» para las demás, con su descripción.
- El panel del ángulo del anuncio ya no dice que su veredicto «decide de verdad» en Activa: el ángulo todavía no
  bloquea nada.
- «La plantilla ha cambiado» pide revisar el **coste**, que es lo que la persona ve, y no un texto que no ve.
- «Partir de una foto» y el aviso del servidor nombran la casilla como se llama de verdad: «Autorizo la comprobación
  de parecido».
- El aviso de un audio de canto cuya duración no se puede medir recomienda los cinco formatos admitidos
  (MP3, WAV, OGG, M4A y AAC), escritos a partir de la misma lista que los valida.
- El montaje muestra los segundos con coma decimal («0,2 s») con un formateador común.

## [0.32.1] · 2026-09-29

Las guías, además de leerse en el repositorio, tienen **su propia web**: un sitio estático con índice por
secciones, buscador, tema claro y oscuro y navegación anterior y siguiente, pensado para publicarse en
**docs.escenara.com**. Se construye desde `docs/guias` sin copiar nada: cada guía sigue teniendo **una sola fuente**.

### Añadido

- **Web de documentación en `apps/docs`** con Astro Starlight, en español y con la marca de Escenara. Lee las
  guías y las capturas de `docs/` en el build; los enlaces entre guías funcionan igual en la web que en el
  repositorio, y los que apuntan a la aplicación o a documentos que no se publican se quedan como texto.
- **Índice de publicación** en [`guias/indice.json`](guias/indice.json): secciones, orden, títulos y
  descripciones. **Solo se publica lo que lista**, y un test comprueba que ninguna guía se queda fuera sin querer.
- **Exclusión por construcción**: el build termina revisando lo publicado y falla si aparece `docs/privado`,
  `plans`, `datos-privados` o algo con forma de clave, también dentro del índice del buscador.
- **Dos guías nuevas** para quien administra la instalación:
  [Configurar la API de cada proveedor](guias/configurar-la-api-de-cada-proveedor.md) y
  [Dar de alta un modelo](guias/dar-de-alta-un-modelo.md).
- **Cuatro diagramas** accesibles, legibles en tema claro y oscuro: el flujo de personaje a exportación, el mapa
  de modelos con sus reservas, el consentimiento y los dos personajes (podcast y dualcast), enlazados desde
  sus guías.
- **`bun run docs:dev`**, **`docs:build`** y **`docs:preview`**, siempre en el puerto **3022**.
- **Imagen Docker** con nginx sin privilegios y comprobación de salud, y el proceso
  [Desplegar la documentación en Easypanel](procesos/desplegar-documentacion-easypanel.md) con el dominio,
  HTTPS y el registro DNS.

## [0.32.0] · 2026-09-29

El montaje. Hasta aquí Escenara acababa con los clips sueltos en la biblioteca y publicar exigía un editor de
vídeo aparte. Desde esta versión el proyecto se monta en una **línea de tiempo simple** —orden, recorte, mezcla de
voz y música, subtítulos— y se exporta a un **MP4 de 1080 × 1920** montado con FFmpeg **en la propia máquina**:
ningún proveedor, **ni un crédito**.

### Añadido

- **La línea de tiempo del proyecto** en `/proyectos/[id]/montaje`: los clips de las escenas en su orden, con
  recorte de entrada y de salida, y una previsualización vertical con las zonas seguras dibujadas. Se ordena
  arrastrando **y con el teclado**, y además con botones de subir y bajar en cada tarjeta: montar un vídeo no
  puede exigir ratón. Recortar **no toca los clips**: siguen enteros en la biblioteca.
- **Guardado explícito y con bloqueo optimista.** Reordenar y recortar no guardan nada hasta que pulsas: el
  montaje se edita a ratos y salvar en cada arrastre convertiría cada tanteo en una versión nueva. Si otra pestaña
  se adelanta, se dice, se vuelve a leer lo guardado y **lo editado se queda en la pantalla**.
- **Mezcla de voz y música de 0 % a 200 %**, con el audio de los clips, las pistas de voz del proyecto en el
  segundo de su fragmento y la música autorizada desde el principio. La mezcla no se normaliza a propósito:
  añadir música no puede bajar la voz sin que nadie lo haya pedido.
- **Subtítulos quemados o adjuntos.** Por defecto van aparte —es lo que prefieren TikTok, Reels y Shorts— en
  **SRT o WebVTT**, con los tiempos ya corridos por los recortes, y se **guardan con la exportación**: el fichero
  que descargas es el que se montó, no uno recompuesto después.
- **Etiqueta de contenido generado con IA** con su posición arriba o abajo, en zona de claridad. Es obligatoria
  en toda exportación, también con personajes completamente animados: el interruptor **no se puede apagar**, y lo
  impide el servidor, no la pantalla. Si la máquina no puede dibujarla —le falta una fuente o el
  soporte de texto de FFmpeg—, **no se exporta**, y el mensaje dice qué instalar.
- **Exportación sin coste con progreso real**: el render va en el worker por etapas de FFmpeg leídas de su
  `-progress` (preparando, normalizando, montando, guardando), y el panel dice desde el principio que **no gasta
  créditos**. Al terminar se ofrecen el MP4 y los subtítulos con enlace temporal renovable.
- **Comprobación previa antes de montar nada**, con el motor de controles de la 0.18.0: un **fallo crítico
  abierto** de la revisión, una escena **sin clip**, un montaje vacío o sin espacio en la biblioteca frenan la
  exportación **diciendo cuál** y llevando a arreglarlo.
- **Exportación idempotente por montaje y versión**: pedirla dos veces no deja dos ficheros comiéndose la cuota de
  nadie. El proyecto **sigue editable** después de exportar, y las exportaciones anteriores dicen si siguen
  correspondiendo al montaje de ahora, para que publicar el vídeo de antes del último cambio no pase por descuido.
- **Admin › Ajustes › Montaje** con el interruptor `montajeActivo`, y el marco vertical, el recorte y el volumen
  en el catálogo de componentes.
- **Guía «Montar y exportar tu vídeo»**, nota legal de la etiqueta de contenido sintético y **ADR-0035** (la línea
  de tiempo simple y el render con FFmpeg en el worker).

### Actualizar desde la 0.21.0

- `bun run db:backup` y `bun run db:migrate`: la migración `0045_montaje-y-exportacion` crea `montages` (uno por
  proyecto) y `montage_exports` (qué se montó, con qué versión, qué salió y qué etiqueta llevaba). **Nada de lo
  que ya había cambia de comportamiento por migrar**: un proyecto sin montaje se comporta como antes hasta que
  abres la pantalla.
- **FFmpeg y ffprobe** tienen que estar instalados en la máquina del worker, con soporte de texto (`drawtext`) y
  una fuente disponible para la etiqueta. Si faltan, la exportación no se encola y la pantalla dice qué instalar,
  en vez de fallar a mitad del render.
- El montaje llega **encendido** —no gasta créditos— y se puede apagar en **Admin › Ajustes › Montaje**. Apagado,
  la pantalla explica quién lo enciende y dónde en vez de fallar.
- Topes de esta versión: **300 s** por montaje, **60 fragmentos**, **15 min** de render, **128 MiB** por archivo
  de entrada y **1 GiB** por exportación. El resultado ocupa cuota de la biblioteca como cualquier archivo.

### Verificado en la cuenta del propietario

- Un proyecto de tres escenas conserva el orden **2, 1, 3**, los recortes de **4, 5 y 6 s**, subtítulos, música
  al 25 % y la etiqueta obligatoria. El MP4 descargado midió **H.264, 1080 × 1920, AAC estéreo y 15,016 s**
  con `ffprobe`; la exportación no consumió créditos. El [recorrido de referencia](procesos/recorridos-de-referencia-0.29-0.32.md)
  enlaza el proyecto y las capturas.

## [0.31.0] · 2026-09-29

### Añadido

- **Personajes animados inventados** en ilustración plana, 3D estilizado y anime, con guía de estilo editable desde Admin › Presets y retrato maestro aprobado.
- El proyecto y sus escenas heredan el acabado. Cada trabajo conserva la versión de la guía; Jev compara la identidad con el maestro. Cambiar de estilo retira las vistas anteriores y exige un nuevo retrato.
- Guía [Crear un personaje animado](guias/personajes-animados.md) y [ADR-0037](arquitectura/decisiones/adr-0037-animados-con-identidad-maestra.md). La etiqueta visible de contenido sintético seguirá siendo obligatoria al exportar, también para dibujos.

### Comprobado y corregido

- En la cuenta del propietario se generaron **cuatro clips reales de 6 s**: dos escenas de Nora en ilustración plana, una de Bruno en 3D estilizado y una de Mika en anime. Los retratos maestros, vistas, fotogramas, clips, escenas y prompts permanecen guardados. Consumo medido: **196 créditos de KIE** dentro del límite autorizado de 200.
- Se corrigió el compositor 6C: los fotogramas animados ya no reciben anclajes fotográficos ni instrucciones de cámara de móvil. La primera prueba de Nora mostró el defecto; sus fotogramas se regeneraron tras la corrección y las versiones anteriores siguen en el historial. El retrato maestro y dos vistas generadas permiten empezar a producir, con aviso si faltan vistas recomendadas. El número de retratos candidatos puede limitarse entre uno y cuatro antes de confirmar el gasto.
- Hailuo 2.3 Standard admite aquí escenas de **6 s** y produce estos clips sin diálogo. La prueba de habla queda pendiente de otro presupuesto: los 4 créditos no consumidos no cubren un clip hablado.

## [0.30.0] · 2026-09-29

### Añadido

- **Trends virales**: formatos cortos versionados que se eligen en «Crear» o en una escena del proyecto. La vista previa en castellano explica qué ocurre, si hay habla y la duración. La estimación del modelo se actualiza al elegir el trend; el total y su sello se confirman antes de generar.
- **Marca dentro de la escena**: si se elige un producto, se pide como objeto físico. Su foto solo viaja al clip con modelos que admiten esa referencia; con los demás se avisa de que la etiqueta puede variar y se exige confirmación expresa. El trend mudo omite el diálogo y mantiene la instrucción de toma única.
- **Vigencia administrada**: alta, edición, nueva versión, caducidad y duplicado desde Admin › Plantillas. Un trend caducado deja de generar y señala una copia vigente equivalente si existe. El catálogo de componentes muestra su estado.
- **Cinco plantillas iniciales** redactadas para la instalación. Nacen **en revisión** y ocultas al usuario hasta que el propietario apruebe la prueba real de pago de cada formato.
- Guía [Usar y administrar trends](guias/trends-virales.md) y [ADR-0036](arquitectura/decisiones/adr-0036-trends-versionados.md).

### Corregido tras la prueba de referencia

- La tarjeta de producción enseña los avisos del producto propios del **clip** antes de pagar la animación. En la primera prueba, Hailuo no admitía la foto del tarro como referencia de vídeo y el servidor exigía confirmar ese riesgo, pero la pantalla no ofrecía la casilla.
- Un clip fallido puede repetirse con el fotograma aprobado después de autorizar un reintento; la pantalla ya no obliga a pagar otro fotograma. Los proyectos ofrecen también **5 s**, duración medida con MiniMax H3, para poder cambiar de modelo cuando Hailuo devuelve un error interno.
- Dos trends de 5 s se generaron con MiniMax H3 y quedaron en la cuenta del propietario con sus plantillas, producto, prompts y trabajos anteriores. Consumo real: **96 de 100 créditos** autorizados. El MP4 conjunto se exportó sin coste y `ffprobe` verificó H.264, 1080 × 1920, AAC y 10,013 s. El unboxing no es una primera persona perfecta y la rotulación fina del tarro varía: la [registro de recorridos](procesos/recorridos-de-referencia-0.29-0.32.md) lo muestra sin ocultar esos límites.

## [0.29.0] · 2026-09-29

### Añadido

- **Cantar o hablar con audio propio**: cada escena puede elegir un archivo de la biblioteca, medir su duración y sincronizar el retrato vertical del personaje con lo que se oye. El clip conserva la voz del archivo; Escenara no compone música ni sustituye la voz.
- **Derechos antes de generar**: declaración de música propia, música con licencia identificada o audio hablado propio, registrada con fecha e IP. La declaración y el consentimiento vigente del personaje son obligatorios; no se verifican automáticamente los derechos musicales.
- **Coste por segundo**: se muestran duración facturable, tarifa publicada, resolución, estimación y sello del precio antes de confirmar. La reserva y los reintentos se verifican en el servidor. El canto está apagado por defecto hasta aprobar una prueba real de pago.
- **Admin › Ajustes › Canto**: interruptor, modelo, tope de duración y resolución. El catálogo de componentes incluye la declaración y el resumen de la pantalla.
- Guía [Cantar con tu audio](guias/cantar-con-audio-propio.md), [ADR-0034](arquitectura/decisiones/adr-0034-canto-con-audio-propio.md) y nota de derechos en [Cumplimiento y privacidad](legal/cumplimiento-y-privacidad.md).

### Corregido tras la prueba de referencia

- La dirección guardada de la escena de canto (plano, ángulo, cámara y gesto) llega ahora al encargo del clip. La vista previa explica que los labios siguen el audio propio; antes decía por error que debían permanecer cerrados.
- La producción de un proyecto compuesto solo por canto deja de mostrar el aviso de duración del modelo de animación normal; las escenas normales siguen mostrando ese aviso si se cambia su duración, aunque ya tengan un fotograma generado.
- Dos trabajos de InfiniteTalk fallaron por error interno del proveedor sin cobro. Kling AI Avatar Standard generó un clip de prueba con el MP3 original: **88 créditos medidos** frente a 96 estimados, dentro del límite autorizado de 200. La migración 0051 completa solo las fichas Kling antiguas descubiertas que nunca modificó el admin, para ofrecer su familia y tarifa de canto. El montaje etiquetado quedó guardado sin gastar créditos y `ffprobe` comprobó H.264, 1080 × 1920, AAC estéreo y 12 s. **La revisión del propietario detectó que los labios no siguen el sonido:** el MP3 sintetizado no tiene voz cantada reconocible y esta prueba no valida todavía el canto. Se conserva como caso de fallo de calidad y se repetirá con una voz adecuada.
- La vista previa del clip indica las dimensiones reales del archivo: Kling devolvió 848 × 1072 aunque el montaje final sea 9:16. La descarga del MP4 exportado pide al almacenamiento que lo entregue como adjunto; el enlace anterior podía abrir el vídeo en el navegador al cruzar de origen.
- La ayuda de la escena de canto indica ahora que manda la duración del audio. Antes mostraba los 8 s generales del proyecto incluso cuando el archivo elegido duraba 12 s y el plan cobraba 12. Una [segunda prueba vocal](procesos/recorridos-de-referencia-0.29-0.32.md) conserva la composición y grabación originales del propietario, el recorte, la declaración, el clip de 96 créditos y el montaje etiquetado. Los dos intentos suman 184 de 200 créditos autorizados. El MP4 final tiene H.264 a 1080 × 1920 y audio AAC; el proveedor añadió fondo y letras ilegibles. La revisión perceptiva del lip-sync sigue pendiente.

### Corregido

- Cambiar el audio invalida la aprobación de una escena y su plan. El plan usa el coste por segundo del canto en vez del precio del clip normal.

## [0.28.0] · 2026-09-29

### Añadido

- **Dos personajes por escena**: «Reparto» permite elegir solo, podcast o dualcast, añadir un segundo personaje propio, asignar papel, lado y mirada, y escribir el diálogo por turnos. Lo que dice cada uno se envía literalmente, sin traducir. La pantalla previsualiza en castellano lo pedido y avisa si el diálogo no cabe en la duración.
- **Podcast y dualcast**: el podcast genera dos clips ordenados, uno por personaje; el dualcast, uno con los dos. Antes de confirmar se muestra la estimación por clip y total, con fecha del precio. Una sola confirmación del total conserva la reserva independiente de cada clip. Se avisa de voces iguales, turnos sin repartir y diálogo demasiado largo.
- **Consentimiento por persona**: cada persona real que aparece debe tener su consentimiento vigente. La pantalla dice por nombre a quién le falta y dónde resolverlo. Se admite mezclar un personaje inventado con uno real, con la declaración y el consentimiento que correspondan.
- **Revisión con Jev**: identidad comprobada por cara, con el nombre de cada personaje en el veredicto, y `reparto_fiel` para comprobar quién dijo cada frase. Esta última comprobación nace en sombra.
- **Admin › Ajustes › Dos personajes**: interruptores de podcast y dualcast; el catálogo de componentes muestra el resumen de lo pedido y la zona de consentimiento. El veredicto `reparto_fiel` se configura en Coherencia.
- Guía [Podcast y dualcast](guias/podcast-y-dualcast.md) y [ADR-0033](arquitectura/decisiones/adr-0033-reparto-de-dos-personajes.md).

### Corregido

- La estimación de una escena de dos personajes incluye, una sola vez, el coste máximo de traducción que el servidor exige al confirmar. Antes, la cifra visible podía ser menor que la confirmación requerida y el servidor rechazaba el envío.

## [0.27.1] · 2026-09-29

### Corregido

- **Los guiones del anuncio se quedan en su ángulo.** La prueba real con el modelo de texto mostró guiones que
  arrancaban bien y se iban a otro ángulo (por ejemplo, cerrar con el precio en un anuncio de comodidad). Ahora
  las instrucciones dicen que el ángulo vale para todas las escenas, que la primera entra por su punto de entrada
  y que contar la oferta en el cierre no es cambiar de ángulo. La comprobación de Jev sigue la misma regla, así
  que decir el precio de la oferta ya no cuenta como mezcla.
- **El veredicto del ángulo no promete lo que no hace.** Dice si el guion mezcla ángulos y enseña lo que miró, pero
  no nombra cuál es el intruso: se han quitado esas promesas de la pantalla y de los comentarios.
## [0.27.0] · 2026-09-28

La estrategia del anuncio: un anuncio no es creatividad, es un sistema con tres palancas. El **ángulo** (a quién
le hablas y desde qué dolor o deseo) pesa el 80 %, la **oferta** empaqueta lo que se da y la **creatividad** —el
hook, el montaje— amplifica las dos anteriores, pero no salva un anuncio con mal ángulo. Hasta ahora el guion
nacía de una idea suelta; desde esta versión las dos palancas que deciden van **delante**.

### Añadido

- **El brief del anuncio**, primer paso de cada proyecto: de qué producto es, a quién le habla, la **versión
  mejor de sí mismo** que compra quien lo ve, **un** ángulo de los doce y la oferta. Es **opcional**: sin brief,
  el proyecto se escribe y se produce exactamente como antes.
- **Los doce ángulos** como catálogo editable, con su definición, por dónde entra y un ejemplo escrito: problema,
  identidad, mecanismo, beneficio, objeciones, emocional, estatus, miedo, comodidad, precio, comparación y
  rompemitos. **Un solo ángulo por vídeo**: mezclar varios es el error más común y aquí no se puede ni guardar.
- **La oferta como ficha reutilizable** atada a un producto: qué se da (lo único obligatorio), precio, garantía,
  urgencia y regalo. Lo que dejes vacío **no aparece** en el guion: no se inventa un precio ni una garantía. Se
  puede **duplicar** a otro producto y se edita en un solo sitio para las doce variantes.
- **Hooks y guion desde el brief**: el asistente propone **cinco arranques** para elegir y editar y un guion por
  escenas, con el ángulo y la oferta ya decididos. Con su estimación y su confirmación de coste, como el resto
  del texto. El hook elegido se escribe como **primera frase del guion** y su movimiento de cámara y su gesto
  llegan a la dirección de la primera escena, sin duplicar el dato.
  Los cinco hooks pagados **se guardan en el proyecto** antes de responder: si la respuesta se pierde, siguen ahí.
- **Variantes por ángulo**: crear proyectos **hermanos** del mismo producto y la misma oferta, uno por ángulo,
  con **una sola confirmación de coste agregada** y hasta doce de una vez. Cada hermano nace como
  «Título · Ángulo» y solo se escribe texto: **no se genera ningún vídeo**.
- **Declaración de veracidad** en los ángulos que afirman algo comprobable —mecanismo, beneficio, miedo y
  comparación—: aviso claro, el texto entero delante y una casilla. Sin ella no se pide el guion, y el mensaje
  dice exactamente qué falta. Se guarda con su fecha y su IP, como el consentimiento.
- **Jev comprueba el ángulo** con el veredicto `angulo_fiel`: si el guion responde al ángulo elegido, si **mezcla
  otros** (y dice cuáles) y si la oferta aparece como se definió. Se pide **a mano**, va **en sombra** —se
  registra y no bloquea nada— y se puede decir si tiene razón o se equivoca.
- **Admin › Ajustes › Estrategia del anuncio**: interruptores del brief y de las variantes. El catálogo de
  ángulos se edita en Admin › Presets, categoría «Ángulo del anuncio», con su «por dónde entra», su ejemplo y si
  pide declaración; solo lo amplía quien administra, porque su definición es con lo que se comprueba el guion.
- **Guía «La estrategia del anuncio»** en la documentación y ADR-0032 con el brief a nivel de proyecto.

### Corregido

- **Editar un ángulo del anuncio ya no lo deja mudo.** Guardar un preset de la categoría «Ángulo del anuncio»
  desde el admin descartaba su «por dónde entra», su ejemplo y, peor, su obligación de declarar veracidad. Ahora
  los tres se conservan y se editan desde el mismo diálogo.

## [0.26.2] · 2026-09-28

### Corregido

- **El aviso «este modelo no admite la foto del producto» se ve antes de pulsar.** En «Crear» el panel de
  controles no conocía el producto elegido, así que el aviso solo aparecía al generar, como un error sin casilla
  para confirmarlo (por ejemplo, un clip con Veo 3.1 Fast y un producto con foto). Ahora elegir o quitar el
  producto vuelve a evaluar los controles y el aviso sale con su casilla, junto con los modelos que sí llevan la
  foto. No se cambia de modelo por su cuenta ni se cobra nada.

## [0.26.1] · 2026-09-28

### Corregido

- **Un personaje inventado ya tiene imagen.** La imagen del personaje (la de la lista y la ficha) solo podía ser
  una foto original, y un inventado no tiene ninguna: todas sus imágenes son generadas, así que se quedaba con la
  inicial. Ahora un inventado usa su primera imagen; una persona real sigue usando su primera foto original.
- **Cambiar la imagen del personaje sin adivinar cómo.** Cada foto que puede serlo lleva el botón «Usar como
  imagen del personaje», que la pone la primera. Arrastrar para ordenar sigue funcionando igual.

## [0.26.0] · 2026-09-28

Los productos: presentar, mostrar y manipular algo delante de la cámara **sin que su etiqueta cambie**.

### Añadido

- **Productos**, pantalla nueva. Un producto es una ficha tuya con su nombre, su descripción, su tipo (físico
  o digital) y sus **fotos con un papel cada una**: frontal con la etiqueta, envase, mecanismo, captura de
  pantalla o el producto solo. Se reutiliza entre clips, escenas y proyectos. Nadie más lo ve.
- **Elegir producto y acción al dirigir un clip**, en «Crear» y en la escena de un proyecto, con pictograma y
  frase llana por acción: sostenerlo, mirarlo, señalarlo, enseñarlo a cámara, abrirlo, aplicarlo y el
  **producto solo**. Las acciones son presets: quien administra las edita sin tocar código.
- **Acciones de moda**: cuerpo entero, detalle del tejido, giro de 360°, pasarela, pose de editorial y detalle
  del accesorio. **Acciones de cuidado de la piel**: abrir la tapa (usando tu foto del mecanismo), extender el
  producto hasta que se absorbe y masajear. Las de piel salen marcadas **«poco fiable»** y avisan antes de
  cobrar: con los modelos de hoy fallan a menudo.
- **El plano del producto solo se pide sin personaje**: no sale ninguna persona, así que no hace falta elegir
  personaje ni confirmar el consentimiento de nadie. Sale mudo, porque no hay quien hable.
- **Producto digital en tres pasos**: fotograma con la **pantalla apagada**, **inserción de tu captura** en esa
  pantalla (con su perspectiva, su proporción y sin recortarla) y, después, el clip. Los dos primeros son dos
  generaciones distintas, cada una con su estimación y su confirmación, y los dos se ven antes de empezar.
- **La etiqueta no se toca**: a todo lo que lleva producto se le pide expresamente que no rediseñe el envase
  ni reescriba, traduzca o invente ningún texto ni logo. Y **Jev lo comprueba** después con el veredicto
  `producto_fiel`, transcribiendo el texto impreso palabra por palabra y comparándolo con tu foto frontal.
- **Avisos antes de pagar**, todos confirmables y ninguno bloquea: se pierde la identidad registrada, no caben
  todas las referencias, el modelo elegido no admite la foto del producto, el producto no tiene fotos, se ve
  una marca (el filtro puede rechazarlo y entonces **no se cobra**) y la acción es poco fiable.
- **Casilla «Tengo derecho a usar esta marca»**, aparte de la de la imagen. Solo aparece cuando el envío lleva
  producto y **bloquea el envío** mientras no se marca. Queda registrada con su fecha en el trabajo.
- Guía [Presentar un producto](guias/productos.md).

### Cambiado

- **Con producto no se cita la identidad registrada** en el proveedor: sus referencias y esa identidad son
  excluyentes, así que la cara y la voz salen de las fotos del personaje. Se avisa antes de cobrar, con la
  alternativa de hacer el producto en un plano aparte.
- **Con un modelo que no admite la foto del producto** —Veo, cuya segunda imagen es el último fotograma del
  clip y no una galería—, el producto viaja solo descrito con palabras. **No se cambia de modelo por tu
  cuenta**, porque cambiar de modelo cambia la tarifa: se te dice cuáles sí la llevan y eliges tú.
- **Borrar un producto no borra nada de lo generado**: se va su ficha y sus referencias, y se quedan los
  vídeos y fotogramas en tu biblioteca con su archivo, los trabajos con su coste y su historial, y las escenas
  con su guion, solo que ya sin producto.
- En «Crear», el producto elegido entra también en el **fotograma**: con uno físico se ve en la mano, y con
  uno digital ese fotograma **es** el primer paso.

## [0.25.2] · 2026-09-28

Parche de la 0.25.1: debajo de la dirección volvía a salir la misma botonera —look, duración, plano, ángulo,
movimiento, micro-acción y registro estético— y no había forma de guardar una dirección para volver a usarla.

### Añadido

- **Mis direcciones**: guarda con nombre lo que has elegido para dirigir un clip —formato, plano, ángulo,
  movimiento, micro-acción y su momento, registro, voz y acento, instrucciones adicionales, modo experto y su
  descripción, y los campos del fotograma cuando los hay— y vuelve a ponerlo de un clic, en «Crear» y en la
  escena de un proyecto. Se puede renombrar y borrar. **Son tuyas**: nadie más las ve ni las usa. Aplicar una
  dirección rellena los controles y **no genera nada**; el coste se confirma después, como siempre.
- Si quien administra ha **desactivado una opción** desde que la guardaste, esa opción se ignora al aplicarla y
  se te dice cuál, en lugar de enviarse en silencio o de invalidar la dirección entera.

### Cambiado

- **Cada concepto se elige en un solo sitio.** Donde está la dirección, la botonera de la plantilla ya no
  vuelve a ofrecer el plano, el ángulo, el movimiento, la micro-acción, el registro estético, el look ni la
  duración, y si no le queda nada que ofrecer **desaparece**. Nada se pierde por el camino: lo que se elegía
  ahí llega al prompt por la dirección.
- **El texto que se le envía al modelo tampoco se repite.** La dirección **sustituye** a la plantilla del clip
  en lugar de meterse dentro de ella, como ya hacían las 6C del fotograma: antes, un clip dirigido salía con
  dos cabeceras de cámara y con la regla de toma única escrita dos veces.
- En «Crear», el panel de dirección **ya no enseña el bloque del fotograma** (óptica, luz y sitio): con una
  imagen de tu biblioteca no se genera ningún fotograma, y con uno nuevo esos campos se eligen en su paso. El
  registro estético se queda con la dirección del clip, que es a lo que afecta.
- **Animar una imagen que ya tienes no exige además describir la escena**: la imagen dice lo que se ve y la
  dirección pone el encuadre. Si quieres añadir algo, están las instrucciones adicionales. Un clip **sin**
  dirigir sigue necesitando su descripción, que ahí es lo único que describe el clip.

## [0.25.1] · 2026-09-28

Parche de la 0.25.0: la dirección estaba en el motor pero no se podía usar. Cuatro huecos que encontró el
propietario al probarla, y dos formas nuevas de llegar al clip sin pagar un fotograma de más.

### Añadido

- **El acento se puede elegir**. Era una columna del proyecto sin ningún control: ahora está en la cabecera del
  proyecto —España peninsular de fábrica, Madrid, rioplatense, bogotano, CDMX y latinoamericano neutro— y
  también en «Crear», donde no hay proyecto que lo fije. Cambiarlo en un proyecto **dice cuántas escenas
  generadas deja sin valer y pide confirmación** antes de aplicarlo, igual que cambiar la voz; no borra ni
  regenera nada.
- **La dirección del clip está en «Crear»**. El mismo panel que en la escena de un proyecto: formato, plano,
  ángulo, movimiento de cámara, micro-acción con su momento, voz y acento, con los mismos avisos antes de pagar.
- **Otro clip con el mismo fotograma**, en «Crear» y en la escena de un proyecto: se cambia la dirección o el
  texto y se genera otro sin volver a pagar el fotograma. **Los clips anteriores se conservan** en la biblioteca
  y en el historial de la escena; cada clip nuevo lleva su estimación y su confirmación.
- **«Cambiar y volver a generar»** desde un clip terminado: vuelve a abrir la dirección tal como se usó en él
  —lo visible, nunca el prompt en inglés— para ajustar lo que haga falta y lanzar otro.
- **Empezar desde una imagen que ya tienes**: «Crear» empieza eligiendo entre dos caminos, «crear un fotograma
  nuevo» o «usar una imagen que ya tengo». Con el segundo, **el paso del fotograma desaparece entero** —ni
  formulario, ni plantilla, ni estimación de algo que no se va a pedir— y se pasa directamente a dirigir y
  generar el clip. En la escena de un proyecto se puede traer igual una imagen de la biblioteca como fotograma
  de partida. Lo único que se paga es el clip. La imagen tiene que ser tuya, y si salió de un trabajo hecho con
  un personaje, el clip **hereda ese personaje y sus reglas**.
- **Instrucciones adicionales (en español)**: un campo libre que se **suma** a lo elegido con botones y entra en
  el prompt en su sitio, traducido como el resto y limpiado contra inyección de parámetros del proveedor.
- **Modo experto**: escribes tú la descripción entera en español y los botones de dirección dejan de aplicarse.
  El acento y la voz siguen siendo tuyos, y **no se pueden quitar** la regla de toma única, los anclajes de
  realismo ni, con una persona real, la prohibición de retocarla. El prompt en inglés sigue oculto: solo lo ve
  quien administra.
- **Ayuda visual**: cada opción de plano, ángulo y movimiento de cámara lleva su **pictograma** —un esquema de
  dónde está la cámara respecto a la figura o por dónde se mueve— y una frase llana de lo que verá el
  espectador. El momento del gesto lleva una mini línea de tiempo. Componentes reutilizables, en el catálogo
  `/admin/componentes`.

### Cambiado

- El panel de dirección vive en `components/ui/direccion/` y lo usan las dos pantallas: dirigir significa lo
  mismo en las dos y tenerlo duplicado las habría separado.
- «Crear» empieza por elegir de dónde sale el clip y tiene un paso propio para dirigirlo, al que se puede llegar
  sin haber generado ningún fotograma.

### Base de datos

- Migración `0035`: la escena guarda sus instrucciones adicionales, si está en modo experto y su descripción.

## [0.25.0] · 2026-09-28

### Decisión firme del propietario

- **La dirección del clip es el núcleo de valor**: el usuario dirige cada clip parte por parte —formato, plano,
  ángulo, cámara, micro-acción con su momento, guion, voz y acento— y el resultado tiene que ser fiel a lo
  pedido. **Jev comprueba esa fidelidad** y lo dice cuando no se cumple; Laya se evalúa más adelante, cuando
  haya datos de acierto.
- **La regla de toma única no es opcional.** Todo clip se cierra pidiendo una sola toma continua sin cortes y la
  cámara quieta al terminar el movimiento, se haya elegido movimiento o no. Sin ella el modelo corta a media
  frase.
- **Con una persona real nunca se embellece ni se la altera.** Su identidad sale de sus referencias y el
  prompt pide expresamente que no se la retoque, no se la adelgace y no se le cambie el atractivo. Y un rasgo
  que diga su ficha —pecas, lunares, cicatrices, tono de piel, bronceado— es **cómo es ya**, no un efecto que
  aplicar: se reproduce igual que en las referencias y no se exagera, lo pida la escena o la luz lo que pida.
  Las descripciones de belleza solo existen para personajes **inventados** y **solo si el usuario las elige**,
  nunca por defecto.
- **El bloque de anclajes de realismo (C6) lo compone quien administra y el usuario no puede quitarlo**: es lo
  que separa una foto creíble de un render, y cierra siempre el prompt del fotograma.

### Añadido

- **Dirección del clip en seis partes**, elegida con botones y sin escribir una palabra de inglés: formato del
  clip (UGC a cámara o voz en off), plano, ángulo, movimiento de cámara, micro-acción con su momento (antes,
  mientras o después de hablar), guion palabra por palabra, voz y acento.
- **Método 6C para el fotograma**: personaje, cámara, ropa, contexto, luz y anclajes de realismo, en ese orden y
  siempre los seis. La luz deja de ir mezclada dentro del look y el plano, el ángulo y la óptica dejan de ir
  mezclados dentro del formato.
- **Acento por proyecto**: España peninsular (de fábrica), rioplatense, bogotano, CDMX y latinoamericano neutro.
  Se respeta en todas las escenas del proyecto y entra en la descripción de la voz que se registra.
- **Voz de cinco ejes fijada por personaje** —género, edad, gravedad, textura y entrega—, compuesta con el
  acento del proyecto. Cambiarla cambia su firma, que es lo que invalida el registro de voz del proveedor.
- **Clip mudo de verdad** en formato voz en off: se pide boca cerrada y sin voz, y el guion **no viaja** al
  proveedor aunque esté escrito. Se avisa de qué se ha hecho con él.
- **Nueve catálogos nuevos editables desde `/admin/presets`**: formato de clip, plano, ángulo, óptica, luz,
  sitio, movimiento de cámara (por niveles: básico, con variación y avanzado), micro-acción (veinte gestos con
  su momento de fábrica) y registro estético, más el bloque fijo de anclajes.
- **Extracción de las 6C desde una foto de referencia** con la percepción de la 0.24.0: devuelve campos
  revisables y editables, nunca una conversación, y **no se genera nada hasta que el usuario los confirma**. No
  extrae la identidad: eso sale de las referencias del personaje.
- **Modo «cambiar solo…»** (ropa, sitio o postura) partiendo de un fotograma aprobado, con segunda imagen de
  referencia opcional. Es el mismo mecanismo del antes/después: dos salidas de la misma imagen con un rasgo
  cambiado.
- **Comprobación `direccion_fiel` de Jev**, en **modo sombra**: mide si el clip tiene el plano, el movimiento,
  el gesto y el momento que se pidieron, y si es una sola toma. Se configura en Admin › Ajustes › Coherencia.
- **Hoja de identidad 3×3 y registro de qué referencia se usó** en cada generación (`vistas` o `hoja_3x3`), para
  poder comparar las dos con datos. La hoja nace **candidata** y no se usa por defecto.

### Cambiado

- La plantilla `clip-social` **ya no lleva una cámara fija**: hasta la 0.24.x ponía `Camera: steady, with a
  subtle handheld feel.` en todos los clips de todos los proyectos. Ahora la cámara la elige quien dirige.
- La plantilla `fotograma-social` se reescribe con el orden C1→C6 y termina siempre con los anclajes.
- Una plantilla puede declarar hasta **14** variables (antes 12): el método 6C separa en categorías propias lo
  que antes iba mezclado.
- El fragmento en inglés de un preset admite hasta **600** caracteres (antes 300), por el bloque de anclajes.
- **Una instalación que ya existía recibe las plantillas nuevas** como una versión más, con la anterior
  guardada en el historial (que es el camino de vuelta). Si quien administra había editado la plantilla, no se
  toca: su decisión manda sobre la semilla.

- **Panel de dirección en el editor de escenas**: formato, plano, ángulo, cámara, micro-acción con su momento,
  matiz de voz y las cuatro C del fotograma, con la previsualización en castellano de lo que se ha pedido.
- **Casilla «estética de modelo» en la ficha del personaje inventado**, desmarcada de fábrica y solo visible en
  inventados. Con una persona real no aparece, y si llegara, se rechaza.
- **Comparación de la hoja 3×3 frente a las vistas sueltas** en Admin › Coherencia, con muestra mínima de 20 en
  cada grupo. Por debajo de ahí enseña recuentos y no saca conclusiones.
- **Generar la hoja 3×3 desde la ficha del personaje**, con su coste estimado, su confirmación y el motor de
  controles de siempre. Al terminar se ve, y desde ahí se puede hacer la referencia del personaje o
  descartarla. Si el personaje todavía no puede generar, se dice qué le falta y no se ofrece.
- **Rellenar el fotograma desde una foto** en «Crear»: eliges una imagen y se leen de ella la cámara, la ropa,
  el sitio y la luz, en campos que corriges antes de generar. No cuesta créditos y no genera nada hasta que lo
  confirmas. De quién sale en la foto no se lee nada.
  **Leer una foto la sube a un servicio externo**, así que se pide permiso antes: con la foto de un personaje
  tuyo hace falta su declaración de coherencia, y con una foto suelta, que lo confirmes expresamente. Sin eso
  no sale nada de aquí. Hay además un tope diario de comprobaciones con modelo, para que la cuota del plan no
  se pueda agotar con reintentos.
- **«Probar la hoja en la mitad de mis escenas»**, un interruptor en la ficha del personaje, **desactivado de
  fábrica**. Solo con él activado se reparten sus escenas entre la hoja y sus fotos: la prueba cambia con qué
  se genera, así que la decide quien paga. Cada escena dice con cuál de las dos se hizo.

### Medido con dinero real (spike del 2026-09-28, 504 créditos)

- **La regla de toma única funciona: ni un corte en 5 de 5 clips.** Era el riesgo alto de la versión.
- **El movimiento de cámara se respeta** (acercamiento lento), y también el plano, el ángulo, el sitio y el
  registro estético.
- **En un clip de 4 s no cabe un gesto antes o después de hablar**: la frase ocupa el clip entero. Por eso,
  cuando no hay hueco, el gesto se coloca dentro del habla y **se avisa con la causa** en lugar de prometer un
  «antes» que no puede ocurrir.

### Medido con dinero real (segundo spike, clips de 8 s, 315 créditos)

- **Un movimiento de cámara avanzado sí se respeta**: el push-in a los ojos sale continuo y sin corte, así que
  pasa a estar marcado como «con variación» en vez de «avanzado».
- **El gesto «antes de hablar» casi nunca se respeta**: el modelo empieza a hablar en el primer fotograma y
  deja el hueco al final. Ahora se avisa de ello al elegirlo, y «después de hablar» sí se cumple.
- **El clip mudo ya no prohíbe el audio.** Prohibirlo hacía que el proveedor fallara (sin cobrar): ahora solo
  se describe la boca cerrada y el ambiente se pide en positivo.

### Pendiente

- **El acento sigue sin juzgar**: los clips traen audio, pero eso se decide escuchándolos.
## [0.24.1] · 2026-09-28

### Corregido

- **Tus copias de un preset piden lo que dice su descripción.** Al editar una copia propia (por ejemplo, «De
  calle» renombrado a «Playa») solo se veían el nombre y la descripción, pero al modelo le seguía llegando el texto
  del original, oculto: un anuncio en traje de baño salía con ropa de calle. Ahora la descripción que escribes es
  lo que se le pide, y el diálogo lo dice. Las copias que ya tenías se han corregido igual.
- **La escena manda sobre la ropa, el lugar y la luz.** La ficha del personaje se añadía con su vestuario y su
  estilo habituales (luz de ventana, fondo neutro), y el modelo copiaba además la ropa de las fotos de
  referencia. Ahora el bloque de la ficha dice que de las fotos solo se toman la cara y el cuerpo, y que el
  vestuario y el estilo de la ficha solo valen si la escena no dice otra cosa.

## [0.24.0] · 2026-09-28

### Decisión firme del propietario

- **La identidad decide; el guion, la emoción y la voz solo miran.** Cuando Jev da una vista generada por la misma
  persona, esa vista **cuenta como foto de referencia** de un personaje real. Las otras tres comprobaciones nacen
  en **modo sombra**: se registran con su evidencia y no bloquean ni cambian nada, para poder medir su acierto
  antes de darles poder (ADR-0030).
- **La cara de una persona real solo se comprueba si su consentimiento lo dice.** Comparar dos fotos suyas obliga a
  mandarlas a un servicio de percepción que no es el que genera, y un consentimiento firmado para producir vídeo no
  cubre eso. Sin esa autorización no sale ni un byte y sus vistas generadas siguen sin contar, exactamente como
  hasta la 0.23.x. Un personaje inventado no la necesita.

### Añadido

- **Comprobación de parecido en las vistas generadas.** En la ficha del personaje, cada vista generada trae su
  veredicto («es la misma persona», «míralo tú», «no parece la misma persona») con el motivo y un botón para
  comprobarla o volver a comprobarla. La que pasa deja de faltar en la cobertura.
- **Coherencia de una escena en la pantalla de revisión**: si la escena cubre el guion, si el resultado encaja con
  lo descrito y si la emoción de la voz pega con el tono. Cada veredicto trae su evidencia y su confianza, y dos
  botones —«tiene razón» y «se equivoca»— que son la **única** etiqueta con la que se mide si acierta.
- **Percepción con el mapa de modelos**: la cara, el fotograma y la voz los describe un servicio compatible con la
  API de OpenAI del propio usuario (`gemma4` para imagen y `mimo-v2.5` para audio, de fábrica), recorriendo sus
  reservas con la regla de dinero de siempre. Se paga por la **cuota del plan**, así que se apunta con **0
  créditos** y lo que se guarda son los tokens.
- **Admin › Ajustes › Coherencia**: modo y umbral de confianza de cada comprobación, modelos de percepción, tarifa
  de Jev y la clave de TypeSafe (cifrada en la bóveda, de la instalación y no de cada usuario).
- **Admin › Coherencia**: acierto de cada comprobación, falsos pases y frenos de más, medido solo con lo que las
  personas han corregido. Con menos de 20 correcciones enseña el recuento y **no** el porcentaje, y dice por qué.

### Cambiado

- La confianza se muestra siempre con su advertencia: dice cómo de concentrada está la respuesta del modelo, **no**
  cuántas veces acierta.
- El registro de gasto del usuario no incluye lo que cuesta Jev: lo paga la instalación con su propia clave, y
  meterlo ahí inflaría el consumo de quien no lo ha hecho. Se ve agregado en Admin › Coherencia.

### Actualizar desde la 0.23.x

- `bun run db:backup` y `bun run db:migrate`: la migración `0033_coherencia_jev_laya` crea `coherence_decisions`,
  añade el veredicto de identidad a las referencias de personaje y la declaración de coherencia a los
  consentimientos. **Nada de lo que ya había cambia de comportamiento por migrar.**
- En **Admin › Ajustes › Coherencia**, pega la clave de TypeSafe. Sin ella las comprobaciones no se hacen y la
  pantalla lo dice; no falla nada más.
- Cada usuario que quiera comprobar necesita un **servicio compatible con la API de OpenAI que vea imágenes** en
  «Tu cuenta» (y que oiga audio, para la emoción de la voz). Sin él, la pantalla dice qué falta.
- Para comprobar el parecido de un personaje **real**, vuelve a registrar su consentimiento marcando la
  autorización nueva. Mientras no lo hagas, todo sigue como en la 0.23.x.
- Opcional: pon la tarifa de Jev en euros por millón de tokens de entrada. Con 0 se enseñan los tokens y no un
  euro inventado.

## [0.23.4] · 2026-09-28

### Añadido

- **Texto a imagen.** Hay generaciones que no parten de ninguna foto —el retrato de un personaje inventado y, desde
  ahora, «Crear» sin elegir personaje ni imagen— y pedírselas a un modelo de edición era pedirle que editara una
  imagen que no existe. El catálogo importa los modelos de texto a imagen de cada familia (GPT Image 1.5/2/2.5,
  Seedream 4.5 y 5, Flux 2, Ideogram v3, Qwen 2 y 3; nano banana ya sabía hacer las dos cosas) con su precio
  publicado, y «Tu cuenta › Modelos» dice de cada uno si es **imagen a imagen** o **texto a imagen**.
- **Elegir la duración del clip en «Crear»**, con lo que cuesta cada una. Gemini Omni ofrece 4, 6, 8 y 10 s porque
  el proveedor publica el precio de cada duración (63, 84, 105 y 126 créditos a 720p, y los 63 de 4 s son los que
  se pagaron de verdad). Una duración sin tarifa registrada no se ofrece: un precio que no se sabe antes no se
  puede confirmar.

### Corregido

- **Sin foto de partida se usa el gemelo de tu modelo.** Cuando no hay imagen, se genera con el modelo de texto a
  imagen **de la misma familia** que tengas primero en tu mapa de imagen; si esa familia no tiene, con el primer
  modelo de texto a imagen de tu mapa, y si no, con el recomendado. Se estima, se confirma, se reserva y se envía
  **el mismo** modelo y **la misma tarifa**.
- **Los textos de duración ya no contradicen al modelo.** «Crear» decía que el clip era de 8 s «para una acción con
  principio y fin» y después el modelo solo ofrecía 4. Ahora la duración sale del modelo elegido y de lo que sabe
  cobrar, y los presets de duración dejan de prometer nada por su cuenta.
- **Un fallo al preparar el envío dice su causa.** Antes decía «No se ha podido preparar el envío. Se volverá a
  intentar» y lo repetía tres veces aunque fuera algo que no se arregla solo. Ahora dice qué ha pasado
  («Escenara no sabe con qué parámetros pedirle nada a este modelo», «falta la imagen de partida»), que **no se ha
  enviado nada al proveedor y no se te ha cobrado**, y qué puedes hacer. Lo que no es pasajero no se reintenta.

### Seguridad del dinero

- **La duración elegida viaja entera**: estimación → confirmación → trabajo → envío. Antes de llamar al proveedor se
  comprueba que el clip que se va a pedir es el de la tarifa que se apartó; si no coincide, no se envía nada.
- **La tarifa confirmada manda sobre la que el catálogo tenga elegida hoy**: el trabajo guarda su unidad y es esa la
  que se envía.

## [0.23.3] · 2026-09-28

### Seguridad del dinero

- **Solo se puede elegir como variante lo que Escenara sabe enviar.** En modelos de vídeo medidos (MiniMax H3,
  Gemini Omni) la sincronización registraba también la tarifa de un segundo, y elegirla como variante habría
  reservado el precio de un segundo por un clip entero.
- **Un precio publicado que cambia más de un 50 % no se aplica solo**: se deja el anterior y se anota en el historial
  para que quien administra lo revise.
- **Si KIE publica dos precios para lo mismo, se usa el más caro**: estimar por lo alto solo hace confirmar de más.
- **Un solo worker sincroniza a la vez** (cerrojo en la base de datos) y cada precio se bloquea al actualizarlo.

## [0.23.2] · 2026-09-28

### Corregido

- **En un personaje inventado, sus vistas generadas cubren.** Antes «Antes de generar» decía que faltaban todas las
  vistas y la ficha marcaba «Faltan 5 de 5» aunque las tuviera: solo contaban fotos originales, que un inventado no
  tiene ni admite. La ficha habla de «imágenes» y no de «fotos originales» en un inventado.

## [0.23.1] · 2026-09-28

### Cambiado

- **Las vistas de la cabeza y los retratos se generan en 3:4**, con la cara centrada en primer plano; el cuerpo
  entero sigue en 9:16. En 9:16 la cara salía pequeña y descentrada. Solo se pide 3:4 a los modelos cuya
  documentación lo admite (nano-banana-2-lite y Seedream 4.5); en los demás se refuerza el encuadre en la
  indicación. El precio no cambia y los formatos de «Crear» tampoco.

### Añadido

- **«Descartar los retratos pendientes»** en un personaje inventado: dejan de ofrecerse como cara, pero siguen en
  tu biblioteca y no se borra nada. Útil para quedarte con tus propias imágenes.

## [0.23.0] · 2026-09-28

### Decisión firme del propietario

- **Eliges cualquier modelo que ofrezca tu proveedor y ves lo que cuesta antes de generar** (ADR-0029). El
  catálogo deja de ser solo lo que alguien midió con su dinero: se sincroniza con la tabla de precios que el
  proveedor publica.

### Añadido

- **Catálogo dinámico con precios públicos.** KIE publica su tarifa en una API **sin clave y sin coste**, así que
  la instalación la lee sin gastar la credencial de nadie ni un solo crédito. Cada precio se traduce al
  identificador exacto de la API —el parámetro `model` de la página del market, comprobado contra su
  documentación— y los modelos que esta instalación sabe pedir entran con el estado nuevo
  **«precio publicado»**: se pueden elegir, estimar, confirmar, reservar y generar.
- **Familias de imagen nuevas, elegibles con su coste delante**: GPT Image 2, 2.5 Flare, 2.5 Sunburst y 1.5;
  Nano Banana 2, Pro, 2 Lite y Edit; Seedream 4.5, 5.0 Lite y 5.0 Pro; Flux 2 Pro y Flex; Ideogram Character y
  Character Remix; y Qwen Image Edit, Qwen 2 y Qwen 3. Los campos de cada una están leídos en la documentación
  del modelo, no adivinados.
- **Se dice siempre de dónde sale un precio.** En la ficha y en el selector: «publicado por el proveedor, no
  medido en esta instalación» frente al precio medido con dinero real, que es el que sigue valiendo para
  `validado`.
- **Admin › Modelos: «Sincronizar precios»**, con la fecha de la última lectura, cuántos modelos publica el
  proveedor y cuántos sabe pedir esta instalación. También se hace sola una vez al día en el worker.
- **Variante del modelo cuando el proveedor cobra por resolución o por calidad** (GPT Image 2: 6 créditos a 1K,
  10 a 2K, 16 a 4K). La ficha enseña todas sus tarifas con la que se envía marcada, y quien administra la cambia
  desde «Variante»: cambia a la vez lo que se pide y lo que se paga.
- **Aviso de desviación**: si el proveedor cobra algo distinto de lo que publica, la diferencia queda en el
  historial del catálogo. El consumo que se apunta sigue siendo el real.

### Seguridad y dinero

- **Un modelo que esta instalación no sabe pedir no se puede elegir**, aunque tenga precio publicado: se ve en el
  catálogo con el motivo escrito. Enviar a ciegas se paga aunque el proveedor rechace la petición.
- **La sincronización nunca pisa un precio medido** aquí, ni cambia el estado, las capacidades o la unidad de un
  modelo que ya existe: eso lo decide quien administra.
- **Un precio que cambia no toca ningún trabajo ya creado.** Sube la versión de su tarifa y con ella el sello, así
  que una estimación anterior queda caducada y hay que volver a confirmarla antes de gastar. Los créditos ya
  consumidos no cambian.
- **Las tarifas que no se saben antes de generar** (por megapíxel, por millón de tokens) no se importan: un precio
  que no se conoce antes no se puede confirmar.

### Actualizar desde la 0.22.x

- `bun run db:backup` y `bun run db:migrate`: la migración `0030_catalogo_dinamico` añade el estado
  `precio_publicado`, la marca de precio publicado en el registro de precios y la tabla de sincronizaciones.
- **Reinicia el worker** (`bun run dev` no recarga su código): es quien sincroniza los precios una vez al día.
- Nada que reconfigurar. Tu catálogo se queda exactamente como está hasta que pulses «Sincronizar precios» en
  Admin › Modelos o pase la primera sincronización diaria; a partir de ahí aparecen los modelos publicados,
  siempre sin tocar los precios que ya tenías medidos.

## [0.22.4] · 2026-09-28

### Cambiado

- **En cada tipo del mapa hay siempre un selector con todos los modelos que puedes usar**, con su nombre y su coste,
  y dos acciones: «Usar como principal» (lo pone el primero aunque ya esté en tu lista) y «Añadir como reserva».
  Antes el selector desaparecía cuando lo recomendado ya incluía todos los modelos. Lo recomendado es solo el
  punto de partida.

## [0.22.3] · 2026-09-28

### Corregido

- **Reordenar el mapa de modelos de vídeo volvía la lista a su sitio.** El mapa admitía como mucho 6 modelos por tipo
  y lo recomendado de vídeo ya son 8, así que guardar tu orden fallaba. Ahora admite hasta 20, y si algo no se
  puede guardar el mensaje dice por qué.

### Cambiado

- **Cada modelo del mapa se ve por su nombre y con su coste** («Gemini Omni 1.1 Flash (vídeo) · KIE.ai — 63 créditos
  por clip de 4 s a 720p»), en lugar del identificador técnico.

## [0.22.2] · 2026-09-28

### Seguridad

- **La cara de una persona real ya no sale hacia un modelo de texto.** «Completar la ficha con IA» solo envía la
  imagen de un personaje inventado; con una persona real la propuesta sale de la descripción y se dice así. Su
  consentimiento cubre enviar su cara al proveedor de imagen y vídeo, no a cualquier servicio de texto.
- **El asistente de la ficha solo gasta lo confirmado**: la entrada principal del mapa de texto (si es de pago y la
  confirmaste) y las que se pagan por cuota. Ya no salta a otra entrada de pago cuyo coste no se enseñó.

### Corregido

- **«Generar todas las vistas» no cobra dos veces**: las vistas que ya se están generando no se vuelven a encargar,
  aunque se pulse dos veces o se reabra el diálogo.
- El **aviso de gasto alto y el saldo** del encargo de vistas se miden sobre el total, no por imagen.
- Un fallo interno al encargar una vista ya no se enseña en crudo: se dice que no se ha enviado ni cobrado.

## [0.22.1] · 2026-09-28

### Añadido

- **Asistente de la ficha del personaje.** «Completar la ficha con IA», en la pestaña «Ficha»: el modelo de
  **texto de tu mapa** propone los rasgos físicos, el estilo visual, el vestuario, la personalidad y la voz
  prevista a partir de la descripción y —si ese modelo admite imágenes— de la cara del personaje, que viaja en la
  propia petición en el formato multimodal de la API de OpenAI. Con un nombre y una descripción basta.
- **La propuesta se revisa campo a campo.** No guarda nada: se acepta entera o por campos, rellena el formulario
  y la versión nueva la crea «Guardar la ficha», igual que cualquier otra edición tuya. Se dice siempre quién la
  escribió, si vio la imagen y, cuando no la vio, por qué.
- **«Generar las vistas que faltan»**, en «Vistas del personaje»: calcula cuáles faltan, enseña el **total**
  (precio de una imagen por cada vista) y, tras confirmar, encola una por vista. Cada una lleva su reserva, su
  clave de idempotencia y sus controles previos; las que no se puedan encargar se dicen con su motivo y **no se
  cobran**.
- **Guía del alta de un personaje inventado** en su ficha: los cuatro pasos en orden —retratos, elegir la cara,
  completar la ficha con IA y generar las vistas—, con el que toca marcado. El estado se deduce del personaje, así
  que un paso hecho a mano cuenta igual.

### Cambiado

- El mapa de modelos de texto sabe **estimar su entrada principal** sin llamar a nadie: dice los créditos que
  costaría o que ese servicio se paga por cuota del plan y no cuesta créditos. No se mezclan ni se suman monedas
  de proveedores distintos, y solo se pide confirmar un precio cuando lo hay.

### Corregido

- **Las pestañas de la ficha del personaje ya responden al primer clic.** Formateaban fechas sin zona horaria, así
  que el servidor y el navegador escribían textos distintos, React descartaba el HTML recibido y volvía a pintar
  la página entera: durante esa repintada la ficha se veía pero no respondía. Las fechas de la interfaz se
  formatean ahora con la zona fija de Europe/Madrid (`lib/fechas.ts`), y un test lo vigila.

### Actualizar desde la 0.22.0

- `bun run db:backup` y `bun run db:migrate`: la migración `0029_asistente_de_ficha` añade el tipo de ejecución
  de texto `ficha_personaje`, que es como se registra y se concilia cada propuesta de ficha.
- Nada que reconfigurar. Para que la propuesta vea la cara del personaje, pon delante de tu mapa de modelos de
  texto un servicio compatible que admita imágenes (por ejemplo `gemma4`); si el primero no las admite, la ficha
  se propone solo con la descripción y se dice.

## [0.22.0] · 2026-09-28

### Decisiones firmes del propietario

- **Personajes inventados** (ADR-0027): un personaje que no existe, nace de una descripción y su cara se genera.
  No admite fotos de personas reales, no declara mayoría de edad y lo que declara en su lugar —con la cuenta y la
  fecha— es que **no representa a ninguna persona real**.
- **Escenas habladas con identidad registrada** (ADR-0028): la cara y la voz se registran una vez en el proveedor
  y todas las escenas las citan, así que salen con la misma cara, la misma voz y los labios sincronizados. La
  **recomendación de la plataforma es Gemini Omni 1.1 Flash**, que genera voz, ambiente e imagen en una sola
  llamada, sin pista de voz aparte ni mezcla posterior.

### Añadido

- **Imagen y vídeo en el mapa de modelos.** Se eligen y se ordenan en «Tu cuenta» como el texto, la voz y los
  subtítulos: el usuario decide con qué se genera y en qué orden, y quien administra **solo recomienda**. «Crear»,
  las vistas de un personaje y la producción toman el modelo del mapa de su tipo, con sus reservas y la misma
  regla de dinero del recorrido (a la siguiente solo se pasa cuando está probado que la anterior no cobró).
- **Pantalla del modo Omni** en «Voz y subtítulos»: el coste por escena delante —marcado como estimado cuando esa
  duración no se ha medido—, el selector de las treinta voces con su género y su tono, la descripción con el
  acento de España de fábrica, y el estado del registro del personaje con «Registrar de nuevo» en su ficha.
- **MiniMax H3** (`minimax-h3/reference-to-video`) como **segundo motor de escenas habladas**, elegible desde el
  mapa de vídeo: no registra nada en el proveedor, la cara son las fotos del personaje y la voz, una muestra ya
  pagada de la voz del proyecto. Medido con dinero real: 40 créditos por 5 s a 768P y 143 s.
- **Personaje inventado**, en «Personajes → Nuevo personaje → Crear un personaje inventado»: se describe, se
  generan **cuatro retratos candidatos** con su coste confirmado y se elige uno. El elegido se guarda marcado como
  vista generada —nunca como foto— y de él salen las demás vistas. Los que no se eligen quedan en la biblioteca.
- **Bloqueo de fotos reales y de nombres de personas reales** en un personaje inventado, aplicado en el servidor
  al añadir una foto y al guardar cualquiera de sus textos.
- **Modo de voz `omni`** en el proyecto: cada escena se genera entera con el personaje y la voz registrados, sin
  fotograma que aprobar. Se elige una de las **treinta voces** de Gemini Omni con su descripción (acento de España
  por defecto) y su frase de ejemplo.
- **Registro de la voz del proyecto y del personaje en el proveedor**, con su fecha, su cuenta y sus **0 créditos**
  guardados: los dos endpoints son gratuitos, medido con dinero real el 2026-09-28. Un identificador que el
  proveedor deja de reconocer se vuelve a registrar **una sola vez**, tampoco con coste.
- **Regla nueva del motor de controles** (`omni-sin-registro`): sin voz registrada o sin el personaje registrado
  con ella, la escena no se produce y se dice exactamente qué falta y dónde se arregla.

### Cambiado

- **Gemini Omni 1.1 Flash es la recomendación de la plataforma** para las escenas habladas: genera voz, ambiente
  e imagen en una sola llamada, sin pista de voz aparte ni mezcla posterior. MiniMax H3 queda como alternativa.
- **El modelo de las escenas habladas sale del catálogo y del mapa**, no del código: la lista del código solo dice
  para qué modelos sabe montar la entrada esta instalación y en qué orden los prefiere.
- Una **reserva del mismo proveedor** ya no se prueba tras un rechazo probado: los tres códigos que prueban que no
  hubo cobro son de la cuenta, así que otro modelo suyo repetiría el mismo rechazo.
- Los **registros de Omni tienen ritmo máximo** por usuario: no cuestan créditos, pero envían imágenes al
  proveedor con la clave de alguien.
- El filtro de **nombres de personas reales** de un personaje inventado reconoce también apellidos y apodos
  («Messi», «Obama», «Bardem»), no solo el nombre completo.
- En modo `omni` la rejilla de producción **no ofrece aprobar fotograma**: la escena es un solo trabajo y su coste
  es el del clip (63 créditos por 4 s con Flash y 40 por 5 s con H3, medidos; las demás duraciones,
  proporcionales y marcadas como estimadas). Y tampoco exige que el modelo de imagen tenga precio: en este modo
  no se genera ningún fotograma.
- El formulario de consentimiento ya no ofrece el titular «inventado»: un personaje inventado nace inventado, y no
  se le puede registrar después un consentimiento de imagen.

### Actualizar desde la 0.21.x

- `bun run db:backup` y `bun run db:migrate`: la migración `0028_escenas_habladas_omni` añade el modo de voz
  `omni` y la voz Omni del proyecto, el titular de consentimiento `inventado` con su declaración, la marca de
  personaje inventado y la tabla de registros Omni de cada versión de ficha.
- Nada que reconfigurar: los proyectos siguen en el modo de voz que tuvieran, y registrar la voz y el personaje no
  cuesta créditos.

## [0.21.2] · 2026-09-28

### Añadido

- **Cargar los modelos de un servicio compatible desde su API.** En «Tu cuenta», «Cargar modelos del servicio» pide
  su lista (`GET /models`, sin consumir cuota) y la ofrece clasificada en **texto, voz y transcripción**; los de
  imagen, vectores y reordenación no se ofrecen. Si falta alguno, se puede seguir escribiendo a mano.
- **Gemini Omni 1.1 Flash** (`google/gemini-omni-flash-1-1`) en el catálogo: 63 créditos por 4 s en 9:16 a 720p,
  medido con dinero real, igual que Gemini Omni y un 35 % más rápido. A 360p KIE cobra lo mismo, así que no se ofrece.
- **Kokoro de NaN builders validado** con una llamada real en español (voces Dora y Alex): ya se puede elegir en el
  apartado «Voz» del mapa para proyectos con voz de kokoro.

### Cambiado

- **Ordenar es arrastrar y soltar**, también con teclado: los modelos del servicio y el mapa de modelos dejan las
  flechas.
- **Cada apartado del mapa ofrece solo los modelos de su clase**: whisper en subtítulos, kokoro en voz y los de chat
  en texto. Antes ofrecía los de texto también como subtítulos.
- **Editar un servicio compatible sin volver a pegar la clave** mantiene la guardada, salvo si cambia la dirección:
  la clave de un servicio nunca viaja a otra dirección.
- La sección de servicios se llama «Servicios de texto de tu plan» y explica que se usan primero.
- Gemini Omni pasa a llamarse «Gemini Omni (vídeo)»: el nombre anterior era el de Flash.

### Corregido

- La semilla del catálogo no guardaba el precio de los modelos de servicios compatibles, así que un modelo
  compatible validado seguía «sin precio» y no se podía elegir.

### Actualizar desde la 0.21.1

- `bun run db:backup` y `bun run db:migrate`: sin migraciones nuevas, pero la semilla añade Gemini Omni 1.1 Flash y
  el precio de kokoro. Para validar kokoro en una instalación existente, hazlo en Admin › Modelos con su evidencia.

## [0.21.1] · 2026-09-28

### Decisiones firmes del propietario

- **Mapa de modelos por tipo de generación** (ADR-0026). Para el texto, la voz y los subtítulos, cada usuario
  tiene una **lista ordenada** de con quién se intenta: la primera es la principal y las siguientes son reservas
  que se prueban solas. Sustituye a las tres elecciones fijas que había escritas en el código.
- **Errores visibles.** Todo fallo que ve una persona dice **cuatro cosas**: qué falló de verdad (proveedor,
  modelo y causa concreta), si se ha cobrado o no se sabe, qué se intentó después y qué puede hacer. «Vuelve a
  intentarlo en un momento» queda prohibido.
- **Los créditos de dos proveedores no son la misma unidad**: no se suman, no se comparan y no se convierten
  entre sí. Cada coste se enseña, se confirma y se aparta en la moneda de quien va a cobrar.
- **En texto, tus servicios compatibles van primero.** Mientras no guardes tu propio mapa, las traducciones y el
  asistente usan antes los modelos de tus servicios compatibles (por ejemplo NaN builders con gemma4,
  glm5.3-flash o qwen3.8-flash, que se pagan por cuota del plan) y dejan el modelo de texto de pago de la
  plataforma como última reserva.

### Añadido

- **Servicios compatibles con la API de OpenAI en la bóveda**, por usuario y varios a la vez: nombre visible,
  dirección base, clave cifrada y lista ordenada de modelos. Plantilla precargada de **NaN builders**. La clave
  se comprueba con `GET {base}/models`, que no consume cuota.
- **Adaptador de texto** genérico (`POST {base}/chat/completions`, `stream: false`) y **adaptador de voz**
  (`POST {base}/audio/speech`, modelo `kokoro`), más **transcripción** (`POST {base}/audio/transcriptions`,
  modelo `whisper`, `verbose_json` con marcas de tiempo).
- **Pantalla del mapa** en «Tu cuenta»: reordenar, añadir y quitar opciones por tipo, con lo que recomienda la
  instalación a la vista y el motivo concreto cuando una opción no se puede usar.
- **Recomendaciones de la plataforma** en Admin › Modelos: qué se recomienda por tipo y en qué orden. Sin nada
  escrito, se deduce del catálogo, así que una instalación migrada se comporta igual que antes.
- **Cambio de crédito a euros por proveedor** en Admin › Ajustes. El valor que hubiera se conserva como el de
  KIE. Los proveedores de cuota y lo que se hace en la propia máquina cuentan 0 €.
- **Dos modelos de vídeo de KIE**, medidos con dinero real el 2026-09-28: `gemini-omni-video` (63 créditos por
  4 s en 9:16 a 720p, dice el diálogo en español con exactitud) y `grok-imagine/text-to-video` (14,4 créditos
  por 6 s a 480p, prompt solo en inglés y sin diálogo, para animación y anuncios). El modelo predeterminado no
  cambia.

### Cambiado

- **La traducción de prompts y el asistente de guion** recorren el mapa de texto en lugar de usar el modelo
  predeterminado del catálogo. Cada entrada reserva y cierra su propio gasto con la regla de lista blanca de
  siempre; las de cuota apuntan **0 créditos** y guardan los **tokens** de `usage`.
- **La voz** recorre el mapa en lugar de la pareja fija «ElevenLabs vía KIE → ElevenLabs directo». Al encolar se
  guardan los topes autorizados de **cada** reserva, en su moneda, y el relevo solo va a donde el usuario vio el
  coste y solo si cabe en él.
- **Los subtítulos** recorren el mapa: el transcriptor local primero (gratis y sin que el audio salga de la
  máquina) y, si falla, un servicio compatible.
- **Las voces se ofrecen por familia**: los identificadores de ElevenLabs y los de `kokoro` no son los mismos,
  así que una opción de otra familia no puede leer la voz fijada y no se usa como reserva.
- **Los euros consumidos** se suman de los importes ya apuntados, no multiplicando créditos de proveedores
  distintos por una sola cifra.
- **Los mensajes de fallo de fotograma, clip y voz** pasan por el mismo compositor: proveedor, modelo, causa
  concreta, qué pasó con el dinero y qué hacer.

### Seguridad

- La dirección base de un servicio compatible **la escribe el usuario**, así que es el único proveedor con
  riesgo de SSRF: solo `https`, sin credenciales ni puertos no estándar, el host tiene que resolver **solo** a
  IP públicas, la conexión se fija a la IP comprobada y **no se siguen redirecciones**. Se comprueba al guardar
  y en cada llamada.
- Del error de un servicio ajeno **no se conserva su texto**: solo un código propio y las precisiones que saque
  una lista blanca (cuántas peticiones simultáneas admite, cuándo se repone la cuota). Ninguna clave aparece en
  un mensaje, aunque el proveedor la repita en el suyo.

### Migración

- `0025_proveedores_compatibles`: servicios compatibles por usuario, `provider_name` y tokens en las ejecuciones
  del asistente y en el registro de gasto.
- `0026_mapa_de_modelos`: entradas del mapa por usuario y tipo, proveedor `local`, y el ajuste `eurosPorCredito`
  pasa a `eurosPorCreditoKie` sin perder su valor.
- `0027_servicios_de_cuota`: los servicios compatibles guardan la declaración de que cobran por cuota del plan.
  Solo se admiten los declarados; uno dado de alta antes de esta migración queda sin usar hasta que se vuelva a
  guardar marcando la casilla.

### Seguridad del dinero

- **Un servicio compatible solo se usa si declaras que cobra por cuota de tu plan.** La dirección la escribes
  tú y podría ser de un servicio de pago por uso: sin esa declaración no se da por gratis ni se apunta a 0.
- **Tras un fallo que no prueba si hubo cobro, ya no se vuelve a ninguna entrada de pago** del mapa, aunque entre
  medias falle una gratuita: solo se prueban las gratuitas.
- **El cambio automático de la voz solo va a la reserva cuyo coste ves en pantalla**, no a las siguientes.

## [0.21.0] · 2026-09-28

### Decisiones del propietario

- **La voz se elige por proyecto, no por escena.** Hay dos modos y son excluyentes: **«voz del clip»** (de fábrica,
  el modelo de vídeo pone el diálogo en boca del personaje con los labios sincronizados, sin ningún gasto nuevo) y
  **«pista de voz aparte»** (los clips se piden sin diálogo y el audio se genera escena a escena con la **misma voz
  y los mismos parámetros**). Intentar fijar la voz de una sola escena se rechaza con su motivo: si cada escena
  tuviera la suya, el timbre cambiaría de plano a plano.

### Decisiones provisionales del propietario (2026-09-28, pendientes de confirmar)

- **Proveedor de voz**: el modelo `elevenlabs/text-to-speech-multilingual-v2` del «market» de KIE, con la **misma
  credencial de KIE** del usuario, así que no hace falta una segunda clave. Entra en el catálogo **sin precio**: KIE
  no publica su tarifa, y sin precio registrado no se estima ni se gasta. La pantalla lo dice y no ofrece generar
  hasta que quien administra lo mida una vez y registre el precio en Admin › Modelos. Sin clonación de voz.
- **Transcripción local y sin coste**, con el binario de `whisper.cpp` en la propia máquina: no sale nada de ella y
  **no deja ningún apunte de gasto externo**.
- **Música solo subida por el usuario**, con declaración de derechos escrita. No se genera música.

### Añadido

- **Pantalla de voz y subtítulos del proyecto** en `/proyectos/[id]/voz`: modo de voz, selector de voz con muestra,
  estado escena a escena, editor de subtítulos y música de fondo.
- **Las voces se guardan por su identificador de ElevenLabs**, no por su nombre, y la pantalla sigue enseñando el
  nombre. El identificador entra en la firma de la voz, en el proyecto, en la escena y en la clave de las muestras:
  cambiarlo más adelante invalidaría de golpe todas las escenas con voz y toda la caché de muestras pagadas.
- **Selector de voz con muestra cacheada**: oír una voz cuesta **una sola vez** por voz y por combinación de
  parámetros. La muestra ya pagada se devuelve sin llamar a nadie, y la pantalla dice cuándo va a costar y cuánto.
- **Pista de voz por escena** (modo «pista»), por la **misma cola** que los fotogramas y los clips: reserva atómica,
  idempotencia por confirmación, tope de trabajos simultáneos y de escenas en vuelo, cierre del gasto con lo que
  informe el proveedor y la regla de que tras un fallo sin respuesta no se reenvía nada. Pasa además por el **motor
  de controles**, igual que cualquier otro gasto.
- **Transcripción local con marcas de tiempo** y propuesta de subtítulos a partir de ella. Si no hay transcriptor
  instalado, se dice con su mensaje de instalación: **no se inventan subtítulos**.
- **Propuesta de subtítulos desde el texto del diálogo** cuando no hay audio todavía: reparte el tiempo en
  proporción a los caracteres de cada frase y la pantalla dice que es una propuesta, no una medición.
- **Editor de subtítulos** por escena con texto, tiempos, división de líneas y previsualización sobre el clip con
  las **zonas seguras** de las plataformas verticales dibujadas. Los avisos de legibilidad (línea larga, tres
  líneas, subtítulo demasiado rápido) **avisan y no bloquean**; los tiempos imposibles sí se rechazan.
- **Exportación a SRT y a WebVTT** desde los **subtítulos editados**, nunca desde la transcripción cruda, con los
  tiempos corridos escena a escena.
- **Música de fondo** con su **declaración de derechos obligatoria** (la exige el servidor, no la interfaz), su
  fecha y su volumen para la mezcla de la 0.22.0. Quitarla no borra el archivo de la biblioteca.
- **Ajustes nuevos en Admin › Ajustes › «Voz y subtítulos»**: ofrecer la pista de voz de pago (**apagada** de
  fábrica), orden del transcriptor local y ruta de su fichero de modelo.
- **Capacidad `tts` en el contrato de adaptadores** y en el adaptador de KIE, con `generarVoz` opcional: un
  proveedor sin modelos de voz sigue siendo válido y sus proyectos usan la voz del clip.

### Cambiado

- **Cambiar el modo, la voz, un parámetro o el diálogo invalida lo que dependía de ello.** Se compara una **firma**
  guardada con la vigente, así que no hay ninguna bandera que se pueda desincronizar. Invalidar es **marcar, no
  borrar**: el audio pagado sigue en la biblioteca. Un cambio que deje sin valer escenas ya generadas exige
  confirmarlo diciendo cuántas son, y **nada se regenera solo**: cada escena se regenera a mano confirmando su
  coste.
- **En modo «pista», el clip se pide sin diálogo** (solo sonido ambiente): si el clip también lo dijera, se oirían
  dos voces distintas diciendo lo mismo.

### Corregido

- **Transcribir un archivo que ya era un `.wav` fallaba**: el temporal de entrada y el convertido eran el mismo
  fichero y FFmpeg se negaba a escribir encima de lo que estaba leyendo.

### Seguridad

- **La muestra de voz no miraba el interruptor del panel.** Con «Voz y subtítulos» apagado en Admin › Ajustes, la
  ruta de la muestra seguía encolando y cobrando: la interfaz escondía el botón, pero la ruta es pública para
  cualquier usuario con sesión. La comprobación vive ahora en un solo sitio y la usan los dos caminos de gasto.
- **Corregir unos subtítulos ya no «revalida» un audio generado con otra voz.** La firma es una sola para el audio
  y para los subtítulos, así que escribirla desde el camino de los subtítulos borraba la invalidación del audio: la
  escena se daba por vigente, dejaba de contar para regenerar y el servidor se negaba a regenerarla («ya tiene su
  voz de ahora»). El montaje final habría salido con un plano en la voz antigua.
- **Un aviso salvable del motor dejaba la voz bloqueada sin salida.** La confirmación de avisos se declaraba pero
  no se leía del cuerpo ni la enviaba la pantalla, así que un aviso confirmable (por ejemplo, precio comprobado
  hace demasiado) no tenía forma de confirmarse. Ahora viaja la evaluación del motor y el diálogo de coste ofrece
  su casilla, igual que en producción.
- **La misma muestra pedida dos veces ya no se cobra dos veces.** La caché solo se rellena al cerrar el trabajo, así
  que perder la respuesta del primer clic (una recarga, dos pestañas) pagaba otra vez el mismo audio.
- **Transcribir o proponer ya no pisan unos subtítulos corregidos a mano** sin pedir confirmación.
- **Pasar a «pista de voz aparte» avisa de los clips ya producidos con el diálogo dentro**, que es la única forma de
  acabar con dos voces en el mismo plano.
- **El texto de un subtítulo se normaliza antes de exportarlo**: un salto de Windows, una línea en blanco o la
  secuencia `-->` dentro del texto partían el fichero SRT o WebVTT en bloques falsos.
- **Transcribir ya no carga el archivo entero en memoria**: va del almacenamiento al disco **por trozos**, contando
  los bytes al escribirlos, y se rechaza lo que pase de 64 MB (un clip de 8 s son unos pocos). Antes, varias
  transcripciones a la vez se llevaban la memoria del proceso.
- **Corregir subtítulos tampoco da por buena una escena en modo «voz del clip»**, donde la voz vive dentro del clip
  y no hay pista propia que mirar. El guardián de la firma pregunta ahora lo mismo que el resto de la aplicación,
  así que vale para los dos modos.
- **Un fallo de la pista de voz ya no marca la escena como fallida en producción**, ni que salga bien borra el
  motivo real de un clip que sí falló: son dos cosas distintas. El fallo de la voz se cuenta desde su propio
  trabajo, en la pantalla de voz.
- **El aviso de los clips ya producidos con el diálogo dentro sobrevive al clic que lo confirma**: se recalcula en
  cada carga, aparece en la escena que hay que volver a producir y desaparece solo cuando se produce. Además mira
  **con qué se produjo ese clip** en lugar del texto de ahora, así que ya no avisa de clips que son mudos.
- **El fallo del transcriptor ya no revela la configuración de la máquina.** El mensaje interno lleva el binario y
  la ruta del modelo; ahora eso queda en el log y el usuario recibe una explicación sin detalles.

#### Proveedor de voz de reserva · decisión firme del propietario

- **El cambio de proveedor de voz es automático.** Si el proveedor principal rechaza la petición de forma que
  **prueba que no ha cobrado** y tienes clave del de reserva, se envía al otro sin preguntar y se te dice después
  en qué cuenta se ha pagado. Si el fallo **no** prueba que no haya cobrado (una avería suya, un corte de red),
  no se cambia y no se reenvía nada: podrías pagar dos veces.

#### Proveedor de voz de reserva · añadido

- **ElevenLabs como proveedor de voz de reserva**, con **credencial propia del usuario** cifrada en la bóveda
  igual que la de KIE. Su prueba de clave usa `GET /v1/voices`, no la suscripción, porque una clave restringida
  al permiso de voz —la que conviene crear— responde `missing_permissions` en esa otra.
- **Adaptador de ElevenLabs** según el contrato de ADR-0015, con su modelo `eleven_multilingual_v2` en el catálogo
  y **precio medido**: 22 créditos de su plan por 79 caracteres, comprobado contra la API real el 2026-09-28.
- **Los proveedores síncronos caben en la cola.** ElevenLabs devuelve el audio en la misma llamada, así que
  `generarVoz` puede traer el resultado consigo y el trabajo se cierra en la misma pasada, por el camino de
  cierre de siempre: mismo apunte de gasto, mismo medio en la biblioteca y mismos enganches de escena.
- **Los subtítulos usan las marcas por carácter** que devuelve el proveedor junto al audio. Son medidas sobre lo
  que acaba de generar, así que valen más que repartir el tiempo entre las frases a ojo. Se guardan como
  transcripción y proponen los subtítulos **solo si nadie los ha corregido a mano**.
- **La pantalla de voz dice con quién se genera**, con quién se cambiaría y, cuando el cambio ocurre, con quién se
  generó de verdad y en qué cuenta se ha pagado.

#### Proveedor de voz de reserva · cambiado

- **La voz se estima por carácter y en la moneda de cada proveedor.** Cada escena te enseña lo que costaría su
  diálogo con el proveedor elegido y con el de reserva, cada uno en sus créditos: los de uno no valen lo mismo que
  los del otro, así que no se suman ni se comparan. Un monólogo ya no se estima con el precio de una frase.
- **El cambio automático solo va a lo que viste.** Se hace al proveedor y modelo que se te enseñaron al pedir la
  voz y solo si lo que cuesta allí cabe en esa cifra; si añadiste la clave después o el precio subió, no se
  cambia y el mensaje te dice por qué. Al cambiar, la reserva pasa a nombre del proveedor que cobra y a su importe,
  y lo que se apunta como gastado es lo que ese proveedor informe.
- **La voz del proyecto guarda el proveedor real del modelo**, no uno fijo.
- **Si una voz ya pagada no se puede guardar**, el mensaje dice qué proveedor la cobró, que sí se ha cobrado, que
  no se puede recuperar sin volver a pagar y qué hacer.
- **Todos los mensajes de error de la voz dicen qué falló de verdad** (proveedor, modelo y causa concreta), **si
  se ha cobrado o no**, qué se intentó y qué puedes hacer. Se acabaron los «no se ha podido, vuelve a intentarlo».
  El texto del proveedor, las rutas del servidor y la configuración de la máquina siguen sin salir nunca.

### Actualizar desde la 0.20.x

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`.
  La `0024` añade el valor `elevenlabs` al tipo de proveedor de credencial y no cambia ninguna fila. La
  `0023` añade el modo y la voz al proyecto, la voz, la transcripción y los subtítulos a cada escena, y crea
  `music_tracks` y `voice_samples`. Añade además el valor `voz` al tipo de trabajo de la cola. **No cambia nada de
  lo que ya había**: todos los proyectos existentes quedan en modo «voz del clip», que es exactamente como
  funcionaban.
- **Si quieres subtítulos automáticos, instala el transcriptor**: `brew install whisper-cpp` en macOS, el paquete o
  la compilación de `whisper.cpp` en Linux, y FFmpeg (que ya hacía falta desde la 0.20.0). Sin él, la propuesta
  desde el texto del diálogo sigue funcionando.
- **La pista de voz de pago viene apagada.** Para ofrecerla hay que encenderla en Admin › Ajustes › «Voz y
  subtítulos». Además hace falta una clave del proveedor que la sirva: el modelo de voz de KIE sigue sin precio
  registrado —y no respondió en la prueba real del 2026-09-28—, así que en la práctica la voz se genera con
  **ElevenLabs**, cuya clave se añade en «Tu cuenta».

## [0.20.7] · 2026-09-28

### Corregido

- **Los clips de escenas con personaje ya se envían.** Al preparar el envío de un clip, sus referencias se
  filtraban contra las fotos del personaje; la única referencia de un clip es su fotograma aprobado, que no es
  una foto del personaje, así que se descartaba y el clip fallaba sin coste con «ya no llegan al mínimo de 3
  fotos». Esa comprobación es solo de los fotogramas, que son los que envían las fotos del personaje.
- **Cada botón de gasto de la producción lleva la casilla de sus avisos.** El botón decía «falta confirmar el
  aviso» y la casilla estaba en el panel de arriba de la página; ahora está también junto al botón, y marcar una
  marca las dos.

## [0.20.6] · 2026-09-28

### Corregido

- **Producir un proyecto ya deja confirmar los avisos del personaje.** La pantalla de producción evaluaba el
  modelo pero no al protagonista, así que decía «Listo para generar» y el servidor rechazaba el envío pidiendo
  confirmar un aviso (fotos señaladas, vistas sin cubrir) que no aparecía en ninguna parte. Ahora el panel
  «Antes de generar» lo muestra con su casilla.

## [0.20.5] · 2026-09-28

### Corregido

- **Los diálogos ya no se salen de la pantalla.** Uno más alto que la ventana (como el de generar una vista, con
  su panel «Antes de generar») dejaba el botón final fuera de alcance, y un clic fuera lo cerraba. Ahora caben en
  la ventana y se desplazan por dentro.
- **Confirmar un aviso al generar una vista ya llega al servidor.** La ruta de la vista generada no pasaba las
  confirmaciones de «Antes de generar», así que el aviso volvía a rechazar el envío aunque estuviera confirmado.

## [0.20.4] · 2026-09-28

### Corregido

- **El diálogo de generar una vista ya puede confirmar avisos.** Ahora muestra el panel «Antes de generar», el
  mismo de «Crear», con la casilla de cada aviso confirmable. Hasta ahora, cualquier aviso salvable (por ejemplo,
  fotos del personaje añadidas «de todas formas» y señaladas por el control de calidad) lo dejaba atascado, porque
  el servidor pedía confirmarlo y el diálogo no tenía dónde. La evaluación ya no incluye el aviso de vistas sin
  cubrir, que no aplica a la vista que se va a generar.

## [0.20.3] · 2026-09-28

### Cambiado

- **Se puede generar una vista aunque ya tenga fotos** (decisión del propietario). Una foto de perfil de cuerpo
  entero no siempre sirve como perfil de cara, y con buenas fotos se puede sacar una mejor. Se sigue avisando de
  que lo que sale es una vista generada y no una foto, se confirma el coste como siempre y hay una sola vista
  generada por vista: para otra, se quita la anterior.

## [0.20.2] · 2026-09-28

### Añadido

- **Las fotos de cada vista se ven dentro de su tarjeta, en «Vistas del personaje».** Antes la tarjeta decía «3
  fotos» y no enseñaba ninguna: para saber cuáles eran había que bajar a «Fotos de referencia» y adivinarlo. Ahora
  el cuadro de la tarjeta muestra **la foto** en lugar del dibujo guía, y con más de una las va pasando sola; la
  silueta se queda solo en las vistas que todavía no tienen ninguna. El pase lo mueve CSS, se detiene al pasar el
  ratón o al enfocar dentro, no se mueve si has pedido menos movimiento, lleva puntos de cuál se ve y al pulsar una
  foto se va a ella en «Fotos de referencia». Una vista generada se distingue con su distintivo también ahí.
- **Las fotos de referencia se ordenan arrastrando.** Se coge cada foto por su asa y se suelta donde quieras, con
  ratón o con el dedo, y el orden se guarda **una sola vez al soltar**. Con el teclado se hace igual de bien: se
  enfoca el asa, `Espacio` coge la foto, las flechas la mueven, `Espacio` la suelta y `Escape` lo deja como estaba,
  contando cada paso en voz alta para quien use un lector de pantalla. Se han quitado las flechas de antes, que ya
  no hacen falta. La primera foto sigue siendo la portada y la primera que se le envía al proveedor, y se dice.

### Corregido

- **Una foto pequeña avisa, pero se puede usar de todas formas.** Estar por debajo del tamaño mínimo era un mínimo
  técnico y no había forma de seguir. Ya no: una foto tuya recortada guía algo peor la identidad, pero sigue siendo
  tuya y útil, así que se avisa, se deja usar y su tarjeta lo sigue diciendo. Los únicos que no se pueden saltar
  son «foto demasiado grande» (no se puede analizar sin bloquear el servidor) y «duplicada» (ya la tienes).
- **Añadir fotos desde la biblioteca ya ofrece «Usarla de todas formas».** Hasta ahora eso solo existía en la
  captura guiada: desde la ficha y desde el alta se veía un error («ninguna de esas fotos sirve como referencia»)
  sin ninguna salida. Ahora se enseña cada foto rechazada con su miniatura, qué le pasa y qué hacer, con su botón
  para usarla igualmente (y uno para todas cuando son varias). Las que no se pueden saltar se explican sin botón,
  y en el alta se puede seguir sin ellas sin perder el personaje ya creado.
- **Una imagen generada sin vista ya se puede clasificar.** Al añadir desde la biblioteca el resultado de un
  trabajo que no era «generar una vista» (uno de «Crear», por ejemplo), la foto entraba marcada como generada y
  **sin vista**: la cobertura la contaba como sin clasificar, decir qué vista era se rechazaba y la única salida
  era borrarla. Ahora se le puede decir su vista. Sigue siendo una vista generada: no cuenta para el mínimo de
  fotos originales ni cubre la vista. La que ya trae la vista con la que se pidió sigue sin poder cambiarse, y la
  tarjeta dice qué hacer si no es la que querías.

## [0.20.1] · 2026-09-28

### Corregido

- **Generar una vista que le falta a un personaje ya no se frena por faltarle vistas.** El control previo avisaba
  de que las referencias no cubrían las vistas recomendadas y pedía confirmarlo, pero el diálogo de la vista no
  tiene dónde confirmarlo, así que no había forma de seguir; y generar esa vista es justo lo que completa la
  cobertura. Ahora ese aviso no se aplica a la vista generada. El de fotos señaladas por el control de calidad
  sigue avisando, porque esas fotos se envían igual.

## [0.20.0] · 2026-09-28

### Decisiones provisionales del propietario (2026-09-27, pendientes de confirmar)

- **La comprobación automática es técnica, no de identidad.** Se empieza por lo que **no cuesta nada**: que el
  archivo se lea, cuánto dura, cómo es de grande, su proporción, si lleva audio y si tiene tramos negros o
  congelados, todo medido con `ffprobe` y `ffmpeg` sobre el clip que ya está en la biblioteca. **Que el personaje siga
  siendo el mismo lo valida una persona**, y se dice en la pantalla y en la guía. La revisión multimodal de pago es
  una **opción explícita** con su estimación y su confirmación, nunca automática, y queda en el `UsageLedger` con su
  reserva, su consumo y su liberación como cualquier otro gasto.
- **Qué es un fallo crítico**: formato o duración incorrectos (archivo ilegible, otra duración, otra resolución, otra
  proporción) y cualquier fallo que **marque como crítico** la persona que revisa. Los técnicos **no se cierran
  aceptándolos** —un clip que dura 1 s no deja de durarlo porque alguien lo apruebe—: se cierran regenerando la
  escena. El que marcó una persona se cierra con su propia decisión posterior, así que **todo crítico tiene salida**.
- **Revisa el dueño del proyecto.** Un proyecto o una escena de otra persona responden 404, también para quien
  administra; la moderación de contenido ajeno llega en 0.28.0.

### Añadido

- **Revisión de continuidad de las escenas producidas (RF07)** en `/proyectos/[id]/revision`: escena a escena, el
  clip **junto a la hoja de personaje y al fotograma aprobado**, con zoom común a los tres paneles y navegable por
  teclado. La hoja que se compara es la de la **versión que congeló la aprobación** de esa escena, no la de hoy.
- **Comprobaciones técnicas sin coste** con FFmpeg: archivo legible, duración, resolución, proporción, audio y tramos
  negros o congelados. Cada una muestra **el valor medido y el que se pedía**, porque «falla la duración» sin decir
  cuánto dura no permite decidir nada. Lo que no se puede medir se dice como «no se ha podido medir»: **no medir no es
  aprobar**.
- **Revisión humana** con tres acciones y su propia fila en el historial: aceptar, rechazar con motivo y marcar como
  crítico. Las dos últimas **exigen motivo** (al menos diez caracteres), la misma regla en el navegador y en el
  servidor.
- **Regla nueva en el motor de controles**: exportar con un crítico abierto → **Bloqueado**, con el número de escena,
  el motivo y la acción. El recuento sale de un solo sitio, así que la pantalla de revisión y la puerta de la
  exportación no pueden decir cosas distintas. La versión de reglas sube a `2026-09-27.2`.
- **Una revisión deja de valer sola** cuando se regenera la escena o cuando se crea una versión nueva del personaje
  protagonista. **No se borra nunca**: se marca con su motivo y su fecha y queda en el historial de la escena.
- **Revisión multimodal opcional** por el contrato de adaptadores (capacidad `multimodal_review`, método
  `revisarMedio` opcional), con confirmación de coste, clave de idempotencia y su reserva, consumo y liberación en el
  registro de gasto. **Está preparada y apagada**: hoy ningún modelo del catálogo declara esa capacidad, así
  que la pantalla lo dice y no ofrece el botón. Su veredicto es **siempre «sin decidir»**: aporta una opinión, no
  cierra la revisión ni abre un crítico.
- **Ajustes nuevos en Admin › Ajustes › «Revisión de continuidad»**: tolerancia de duración (0,5 s de fábrica),
  segundos negros o congelados tolerados (0,5 s), exigir audio (**apagado**) y ofrecer la revisión con modelo
  (**apagada**). Qué fallo es crítico **no es configurable**: es una decisión de producto y vive en el código.
- **Guía de usuario** [Revisar la continuidad](guias/revisar-la-continuidad.md), con una sección propia sobre lo que
  la comprobación automática **no** garantiza y el requisito de FFmpeg en el servidor.

### Seguridad

- **Autorización en el servidor en toda la revisión**: la escena se comprueba como propia en la misma consulta que la
  trae, **antes** de tocar nada, y además se exige que sea del proyecto de la URL. `Origin` del mismo sitio y límite
  de ritmo por acción en el POST.
- **El clip se baja a un directorio temporal propio que se borra siempre**, también si la medida falla. A FFmpeg no se
  le pasa nunca una URL: se le pasa un archivo local, así que una orden del servidor no sale a la red con una
  dirección que viene de la base de datos.
- **Nada se apunta en el registro de gasto antes de validar la confirmación**: sin los créditos confirmados, el sello
  vigente y la clave de la confirmación, la revisión multimodal se rechaza en el borde y no deja ni un apunte.
- **Una revisión de pago no se cobra dos veces**: la clave que firma el navegador es única por revisor
  (`review_results_revisor_idempotencia_uq`) y es estable mientras no cambie lo confirmado, así que un doble clic o un
  reintento tras un error de red devuelven la revisión que ya existe **sin llamar al proveedor**. La fila y su reserva
  nacen en la misma transacción, así que no queda ni una fila sin reserva ni una reserva sin fila.
- **Si la llamada falla, la reserva no se suelta**: no se sabe si el proveedor la ejecutó, y soltar lo que quizá se ha
  pagado sería mentir (ADR-0016). Y si el proceso muere entre reservar y cerrar, la revisión queda `reservado`: cuenta
  como **retenido** en el depósito del usuario (con su propio motivo, no confundida con un trabajo) y el barrido de la
  cola la cierra con la misma política. También se apunta el **exceso** cuando el proveedor cobra más de lo apartado.
- **Guardar una revisión bloquea la escena y comprueba que el clip siga siendo el revisado**: si se regeneró mientras
  alguien la miraba, la revisión no se guarda y se dice por qué, en lugar de aprobar un vídeo que nadie ha visto.
- **El clip se baja acotado a 64 MB y por trozos**, sin cargarlo entero en memoria, y de la salida de FFmpeg se leen
  como mucho 512 KiB: ni el tamaño ni el contenido de un archivo deciden cuánta memoria gasta el servidor.
- **El prompt de la revisión lo compone siempre el servidor** y no viaja al navegador (ADR-0022).

### Corregido

- **El depósito de presupuesto ya no dice que lo retenido está en «trabajos pendientes de revisión» cuando no lo
  está.** La pantalla escribía su propia frase y solo sabía contar trabajos, así que con una llamada de texto colgada
  —que ya podía pasar antes de esta versión— explicaba algo que no era verdad. Ahora la frase la compone la misma
  función que usa el servidor al rechazar un gasto por presupuesto (`enQueEstaRetenido`, en `lib/generacion.ts`), y
  enumera las tres cosas que pueden retener: trabajos pendientes de revisión, llamadas al asistente y revisiones con
  modelo.

### Actualizar desde la 0.19.5

- **Instala FFmpeg en el servidor**: `ffprobe` y `ffmpeg` son una dependencia del entorno, no una librería. En Debian
  o Ubuntu, `apt-get install ffmpeg`; en macOS, `brew install ffmpeg`. Sin ellos, la comprobación automática **lo dice
  con su mensaje y no muestra ningún resultado**, en lugar de pintar vistos verdes que no ha medido. Esta versión no
  trae Dockerfile; cuando lo haya, `ffmpeg` se declara ahí.
- **Aplica la migración antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La
  `0022` crea `review_results` con sus cuatro enumeraciones (tipo, severidad, veredicto y estado del gasto) y añade
  `usage_ledger.review_id` con su índice único de apuntes por revisión. **No cambia ni recalcula nada de lo que ya
  había**: sin revisiones guardadas, ningún proyecto bloquea la exportación.
- **Revisa los ajustes nuevos** en Admin › Ajustes › «Revisión de continuidad». Los cuatro vienen con valores de
  fábrica prudentes y la revisión con modelo **apagada**.
- **Lo demás no cambia.** «Crear», el plan y la producción funcionan exactamente como en la 0.19.5. La regla nueva del
  motor solo se evalúa cuando lo que se comprueba es una **exportación**: un crítico abierto no impide producir,
  regenerar ni aprobar nada.
## [0.19.5] · 2026-09-28

### Corregido

- **Sin aviso del script del tema en la consola.** Cuando el navegador tenía que rehacer la página (una extensión que
  toca el HTML, un desajuste o una página de error), React volvía a crear el script que aplica el tema y avisaba
  de que no se ejecuta. El tema se sigue aplicando antes de pintar, sin destello.

## [0.19.4] · 2026-09-28

### Corregido

- **Ahora puedes decir qué vista es una foto que ya tienes en el personaje.** Las fotos subidas desde la
  biblioteca entraban «sin clasificar» y no había forma de asignarles la vista después: la cobertura pedía fotos
  de frente o de perfil que el usuario ya tenía, y volver a añadirlas por la captura guiada las rechazaba por
  duplicadas. Cada foto de referencia lleva ahora su selector **«Qué vista es»**, y el panel de cobertura avisa de
  las fotos sin clasificar —y lleva a clasificarlas— antes de proponer hacer otra foto o generar una de pago.
  Cambiar la vista crea versión, como añadir o reordenar fotos, porque cambia qué fotos se envían al modelo; las
  vistas generadas conservan la vista que pidió su trabajo y no se pueden cambiar.

## [0.19.3] · 2026-09-28

### Corregido

- **Generar una vista que falta de un personaje ya no se rechaza siempre** con «El coste estimado ha cambiado».
  Con la traducción de prompts encendida, el diálogo confirmaba solo el precio del modelo y el servidor exige el
  total que se ve en pantalla, modelo más traducción. Ahora confirma ese total, igual que «Crear».

## [0.19.2] · 2026-09-28

### Corregido

- **Los gestores de contraseñas ya no rompen la página.** LastPass metía su icono dentro de los buscadores y de los
  campos que no son credenciales antes de que la página arrancara; el HTML dejaba de coincidir y la página se
  rehacía entera en el navegador, con dos errores en la consola. Ahora los buscadores, filtros y campos de texto
  piden a LastPass, 1Password, Bitwarden y Dashlane que no los decoren; los de correo, nombre y contraseña siguen
  pudiéndose rellenar desde el gestor.

## [0.19.1] · 2026-09-27

### Decisiones del propietario (2026-09-27, con dinero real por delante)

- **Clips de 8 s por defecto, con 4 s opcional.** Medido con la cuenta de KIE del propietario: un clip de 8 s
  cuesta **los mismos 60 créditos** que uno de 4 s, tanto en Veo 3.1 Lite como en Veo 3.1 Fast. La tabla pública de
  KIE (30 créditos a 720p) **no coincide con lo cobrado**, y manda lo medido. Elegir 4 s no abarata nada y la
  interfaz lo dice al elegirlo.
- **Veo 3.1 Fast como modelo de animación.** Al mismo precio que Lite y con el fotograma respetado: un clip de 8 s
  en 720 × 1280 con voz, generado en 96 s, que **arranca exactamente en el fotograma** que se le entrega.
- **APIMart solo documentado.** Su canal `-ext` sale más barato en imagen (0,0125 USD frente a 0,02 USD) pero **no
  respeta el primer fotograma** con personas reales, y su canal oficial cuesta 0,64 USD por el mismo clip que KIE
  cobra a 0,30 USD. No se escribe adaptador: queda la comparativa en `recursos/apis-y-proveedores.md`.

### Añadido

- **Duración de clip por proyecto**: 8 s de fábrica y 4 s opcional, con el selector del catálogo de componentes y el
  aviso de que la corta cuesta lo mismo. La producción le pide al proveedor **la duración del proyecto**, las escenas
  la copian y el asistente de guion propone escenas de esa duración exacta.
- **Veo 3.1 Fast** en el catálogo, validado, con su precio y su evidencia medidos, y predeterminado para
  `image_to_video`. Veo 3.1 Lite sigue validado al mismo precio, ya no predeterminado.
- **Comparativa de KIE y APIMart** con precios publicados y pruebas reales de las dos plataformas, en
  `recursos/apis-y-proveedores.md`.

### Corregido

- **Las escenas sin diálogo ya no fallan.** Veo se caía con «The Google model was unable to generate audio for this
  request» —sin cobrar— cuando el prompt no decía qué se tenía que oír. Ahora, sin diálogo, se le pide de forma
  explícita **solo sonido ambiente y que nadie hable**.
- **El modelo de texto del asistente queda validado** con su coste medido llamada a llamada (de 0,05 a 0,93 créditos
  según el largo) y su precio registrado baja de 3 a **1,5 créditos** por respuesta.
- **El cliente de texto espera hasta 90 s** (antes 45): la latencia medida llega a 37 s, así que el tope anterior se
  quedaba a un suspiro de tirar una respuesta ya pagada.
- La duración que se guarda del clip en la biblioteca es la que **se le pidió al proveedor**, no la primera que
  declare el modelo en el catálogo.

## [0.19.0] · 2026-09-27

### Decisiones provisionales del propietario (2026-09-27, pendientes de confirmar)

- **Cancelar solo lo que aún no se ha enviado.** Un trabajo en cola o esperando límite se cancela y **suelta su
  reserva**; uno que ya salió hacia el proveedor **no se cancela**: se marca «se cobrará» y sigue hasta el final.
  Verificado en `docs.kie.ai` el 2026-09-27 **sin llamar a la API**: su guía de tareas asíncronas solo documenta el
  `task_id`, el callback y la consulta del registro, y **no existe ningún endpoint de cancelación**. Sin endpoint,
  «cancelar» en el proveedor no se puede prometer (ADR-0024).
- **Cero reintentos automáticos de pago** (PRD §6). Un fallo del proveedor nunca vuelve a enviar nada por su
  cuenta: la cola solo reintenta lo que falló **antes** de hablar con él (`interno`, `limite`), que no ha costado
  nada. El usuario puede autorizar un **presupuesto de reintentos por escena**; cada regeneración de una escena que
  falló con coste posible consume uno, y sin presupuesto se responde 409 diciendo qué hacer.
- **Solo 4 s en 9:16 y 720p.** La recomendación de la fase incluía 8 s, pero **no hay coste medido de 8 s**, así que
  no se ofrece: prometer una duración cuyo precio no se ha medido es lo que ADR-0009 desaconseja (el prototipo
  infraestimó ×3). Producir con un modelo cuya duración no esté en la lista se **bloquea** con su motivo. Queda
  **pendiente de una prueba real**; cuando se mida, se añade al registro de precios y a la lista.
- **Máximo de escenas en vuelo por usuario configurable, por defecto 2.** Cada escena son dos trabajos, así que
  esto acota el gasto comprometido antes de que el usuario haya visto ni un fotograma. Se comprueba **dentro** de la
  misma transacción que ya bloquea su fila para reservar presupuesto.
- **El fotograma no se aprueba solo.** Un fotograma listo deja la escena esperando a que una persona lo mire:
  animar cuesta otro dinero y nadie lo autoriza en nombre del usuario.

### Añadido

- **Producción de las escenas de un proyecto aprobado (RF06)** en `/proyectos/[id]/produccion`: rejilla con una tarjeta por escena, su estado real, su fotograma, su clip, el coste estimado y el consumido, y las acciones que caben en cada momento (producir, aprobar el fotograma y animarlo, regenerar, cancelar, autorizar reintentos).
- **Progreso por etapas reales, sin un solo porcentaje**: `preparando` → `enviado` → `en_curso` → `descargando` → `listo`. Cada etapa se apunta cuando el hecho ocurre de verdad (un worker toma el trabajo, la tarea existe en el proveedor, el proveedor informa de que genera, se está trayendo el archivo, está guardado), y `descargando` existe como columna porque es la única que el estado propio no distingue. El reloj **no interviene en ningún sitio**.
- **Regeneración de una sola escena**, con confirmación de coste y contra el presupuesto del proyecto. Las demás escenas no se tocan: ni su estado, ni sus medios, ni sus reintentos. Lo generado antes **se conserva** como versión en el historial de la escena y sigue en la biblioteca.
- **Historial por escena**: qué versiones se generaron, con qué modelo, cuánto costaron según el proveedor y qué cambió antes de cada regeneración.
- **Cancelación por escena en zona de claridad**: dice antes y después cuántos trabajos se cancelan de verdad (soltando su reserva) y cuántos **se cobrarán** porque ya están en el proveedor.
- **Presupuesto de reintentos por escena**, autorizado por el usuario en un diálogo del catálogo, con los consumidos y los autorizados siempre a la vista.
- **Zonas seguras de TikTok, Reels y Shorts** sobre la previsualización del fotograma y del clip, elegibles con botones. Son aproximaciones documentadas y se dice que lo son.
- **Espera acompañada por Chispa** con las cinco etapas honestas, el puesto real en la cola y el estado crudo del proveedor tal cual. **Celebra solo en hitos reales**: fotograma listo y escena lista.
- **El storyboard del plan muestra ya los fotogramas reales** de cada escena (el aprobado si hay uno y, si no, el último generado). En la 0.17.0 era una lista de texto sin miniaturas.
- **Ajuste nuevo en Admin › Ajustes › «Presupuesto y cola»**: «Escenas en vuelo por usuario» (2 de fábrica).
- **`GET`/`POST /api/proyectos/[id]/produccion`** y **`POST /api/escenas/[id]/produccion`** (`producir`, `aprobar-fotograma`, `regenerar`, `cancelar`, `reintentos`). El `GET` es lectura de verdad: no encola, no aparta presupuesto y no llama a ningún endpoint de pago.
- **Guía de usuario «Producir tu proyecto»** y **ADR-0024** con las dos políticas de dinero de esta versión.

### Cambiado

- **`scenes` gana lo que hace auditable una producción**: fotograma aprobado (medio y trabajo), clip resultante (medio y trabajo), reintentos consumidos y autorizados, motivo del último fallo y marca de «cambió desde la última generación». Los identificadores de trabajo van **sin clave ajena**, igual que `generation_jobs.reservation_id`, para no cerrar un ciclo entre los dos módulos del esquema.
- **`generation_jobs` gana `stage`**, la etapa real por la que va. El **estado manda** sobre la etapa: quien decide el dinero es `state`.
- **El encolado comprueba además el tope de escenas en vuelo**, en la misma transacción que ya bloquea la fila del usuario y reserva el presupuesto. Se cuentan **escenas distintas**, no trabajos.
- **Editar una escena ya generada la marca como cambiada** en lugar de borrar nada: el gasto está hecho y el resultado sigue en la biblioteca. La rejilla lo avisa y el historial lo registra.
- **Los presets obligatorios de la plantilla los resuelve el servidor al producir**: producir no tiene botonera, así que se elige el primer preset activo de cada categoría obligatoria, **filtrando** la duración a la que tiene coste medido (4 s) y el formato a 9:16. Si no hay ninguno que encaje, no se produce y se dice por qué.
- **`resumenDeEscena` acepta solo lo que lee** (acción, texto y orden) en lugar de la escena entera.

### Seguridad

- **Toda la producción pasa por la puerta única del motor de controles con `escenaId`** (0.18.0): plan aprobado, aprobación en pie (precio, ficha y plantilla congelados), afirmaciones verificadas, consentimiento del personaje, credencial, cuota y los tres techos de dinero. `server/produccion` decide **qué** escena toca, nunca **si** se puede gastar.
- **Autorización en el servidor en todas las rutas nuevas**: un proyecto o una escena de otra persona responden 404, también para quien administra, con el dueño en la misma consulta que trae la fila (IDOR). `Origin` del mismo sitio en todos los POST y límite de ritmo por acción.
- **El prompt no llega al navegador** en la rejilla de producción (ADR-0022): lo que viaja son estados, etapas, importes y medios. Hay test.
- **Las claves de aviso confirmadas se acotan en el borde** (como mucho 20, solo minúsculas, dígitos y guiones) y un freno `Bloqueado` o `Requiere revisión` no se salta por venir listado.
- **La idempotencia de una producción en lote es estable**: de la clave que firma el navegador se derivan las de cada escena con `sha256`, así que repetir el mismo clic devuelve los trabajos que ya existen y no encarga otros.
- **Test de revisión de código** que recorre el código de la cola, la generación y la producción y falla si aparece un `<progress>`, un `role="progressbar"`, un identificador de porcentaje de progreso o un ancho calculado con el tiempo.

### Actualizar desde la 0.18.0

- **Aplica la migración antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La `0019` crea la enumeración de etapas, añade `generation_jobs.stage` y nueve columnas a `scenes` (fotograma aprobado, clip, reintentos, motivo del último fallo y marca de cambio). **Todas tienen valor por defecto**, así que los proyectos existentes siguen valiendo tal cual y no se recalcula nada.
- **Los trabajos anteriores no tienen etapa** y se quedan así: se hicieron sin ella. Su estado sigue contándose igual, porque el estado es lo que manda.
- **Revisa «Escenas en vuelo por usuario»** en Admin › Ajustes › «Presupuesto y cola» (2 de fábrica). Es un tope aparte del de trabajos simultáneos y más estricto a propósito: cada escena son dos trabajos.
- **Comprueba que el modelo de animación predeterminado del catálogo declara 4 s.** Esta versión solo produce la duración con coste medido; con otra, la producción se bloquea diciéndolo en lugar de encolar un clip cuyo precio no se ha medido.
- **Asigna un protagonista a cada proyecto que vayas a producir.** Sin personaje con consentimiento vigente no se produce: sus fotos son lo que da identidad a cada fotograma.
- **Lo demás no cambia.** «Crear» funciona exactamente como en la 0.18.x, y un proyecto sin plan aprobado sigue sin poder producir nada.

## [0.18.0] · 2026-09-27

### Decisiones provisionales del propietario (2026-09-27, pendientes de confirmar)

- **Quién puede saltarse un aviso.** «Necesita ajustes» es **salvable por el usuario con confirmación expresa**;
  «Requiere revisión» lo resuelve **aportando algo** (volver a aprobar el plan, verificar una afirmación con su
  fuente) y no tiene casilla; **«Bloqueado» no se salta nunca**, tampoco desde la API. La confirmación de un aviso
  viaja en la petición por la **clave de su regla** y **entra en la firma de idempotencia del cliente**: confirmar
  un aviso distinto es otra confirmación y estrena clave, igual que un coste distinto.
- **Reglas en el código, parámetros en el panel.** No hay editor de reglas en la interfaz. En Admin › Ajustes se
  ajustan solo umbrales de avisos; los frenos duros (credencial, consentimiento, formato del modelo y presupuesto)
  **no son configurables a propósito**: se apagan cambiando el código y revisándolo.
- **Las reglas mandan sobre los modelos de decisión** (ADR-0023, prepara 0.24.0). El contrato de decisiones se
  consulta **después** del motor y solo puede **añadir** un rechazo, nunca levantar un freno: un freno del motor es
  una afirmación objetiva y reproducible, y una opinión de un modelo no autoriza a enviar la cara de una persona a
  un proveedor.
- **El coste que no se puede acotar avisa, no bloquea.** La fase lo proponía como «Bloqueado», pero desde la 0.12.0
  el trabajo queda `esperando_limite` y **no sale** hasta que el usuario fija su techo: ese paso **es** la acción
  del aviso, así que pedir además una casilla no añadiría nada.
- **El mínimo duro de referencias y el consentimiento siguen bloqueando.** El aviso salvable de esta versión es el
  de **cobertura de vistas incompleta o fotos señaladas por el control de calidad**, que es lo que de verdad se
  puede salvar; bajar el mínimo a un aviso sería abrir una puerta de consentimiento.
- **Cualquier afirmación sin verificar de la escena pasa a «Requiere revisión»** al producirla. Es más estricto que
  la 0.17.0, donde solo las de salud bloqueaban, y solo para aprobar el plan.

### Añadido

- **Motor de reglas único de controles previos (RF12).** Antes de gastar, una sola zona dice si se puede generar: **Listo**, **Necesita ajustes**, **Requiere revisión** o **Bloqueado**, **siempre** con el motivo y la siguiente acción. Las comprobaciones que estaban repartidas entre siete ficheros desde la 0.10.0 se han **movido** a `server/controles/motor.ts`, que es una función **pura y determinista**: recibe hechos ya cargados, no consulta nada y devuelve siempre lo mismo para la misma entrada.
- **Panel «Antes de generar» en «Crear»**, en zona de claridad: el estado global y la lista de comprobaciones, cada una con su icono, su motivo, su acción y el enlace al sitio donde se arregla. Se rellena **en el servidor al cargar la página** y se vuelve a pedir desde la acción que cambia lo evaluado (elegir personaje, cambiar de modelo, elegir otra imagen): nunca desde un efecto.
- **Estado por escena en el plan del proyecto**, con el **peor** como estado global del plan. Se calcula con el **mismo** motor que cierra la puerta al producirla, así que lo que se ve no es una promesa, y sin una consulta más por escena.
- **Los cuatro estados se distinguen por color, icono y texto**, nunca solo por color, y están en el catálogo de componentes (`/admin/componentes` → «Controles previos»).
- **La evaluación queda guardada** en `control_evaluations`: sujeto (escena o trabajo), estado, reglas disparadas con su motivo y su acción, **versión del conjunto de reglas**, avisos confirmados y fecha. Es la base de RF13 (0.24.0): sin la versión de reglas, «esto se bloqueó» no se puede reproducir meses después.
- **Ruta de lectura `GET /api/generacion/controles`**: qué diría la puerta si generases ahora. Es lectura de verdad: no encola, no aparta presupuesto, no guarda evaluación y no llama a ningún endpoint de pago (lo único que consulta fuera es el saldo, por el mismo endpoint gratuito que la estimación y con su misma caché de 30 s).
- **Parámetros nuevos en Admin › Ajustes › «Controles previos»**: avisar si el precio del modelo se comprobó hace más de 90 días (**encendido**), avisar si faltan vistas mínimas del personaje o alguna foto la señaló el control de calidad (**apagado**: solo tiene sentido con la captura guiada en uso) y cuántos avisos se pueden confirmar de una vez (3).
- **Guía de usuario «Por qué no puedo generar»** con cada motivo y su solución, y **ADR-0023** con el motor y su precedencia sobre los modelos de decisión.

### Cambiado

- **El encolado tiene una sola puerta.** `crearFotograma` y `crearAnimacion` evalúan **una vez**, con todos los hechos resueltos, y solo después reservan y encolan. Las comprobaciones sueltas que se han movido conservan **su mensaje y su código HTTP**: credencial (409), proveedor sin soporte (503), consentimiento (409), modelo sin referencias (400), plan sin aprobar (409), cuota (413), saldo (402) y los tres techos de presupuesto (402).
- **La puerta de producción de una escena aplica las reglas del motor**, no una copia suya, y lo mismo el tope del proyecto.
- **El despacho reevalúa antes de enviar** con el mismo motor: entre encolar y enviar el usuario puede haber revocado el consentimiento o quitado fotos. Solo se reevalúa lo que puede cambiar sin que él pida nada; las reglas de dinero no, porque su reserva ya está apartada y compararlas otra vez rechazaría el trabajo por su propio apartado.
- **Un grupo de hechos que no está no se evalúa** —lo que permite mirar una escena del plan antes de haber elegido modelo—, pero **la puerta exige que estén todos** antes de dejar encolar y responde 500 si falta alguno: olvidarse de un grupo es un error de programación, no una configuración permisiva.
- **El texto del presupuesto se compone en un solo sitio** (`server/presupuesto/mensajes.ts`), usado por el motor y por la reserva que manda dentro de la transacción: dos textos para el mismo freno acabarían divergiendo.
- **`vista-crear.tsx` se ha partido**: el paso «Elige a quién generas» y el bloque de confirmación son componentes aparte.

### Corregido

- **Un freno de personaje o de proyecto ya no llega al navegador como «error interno».** `ErrorPersonaje` y `ErrorProyecto` no estaban contemplados en el traductor de errores de las rutas de generación, así que un consentimiento revocado respondía 500 en lugar de 409 con su motivo.

### Seguridad

- **Un «Bloqueado» no se puede confirmar ni mandando su clave de regla por la API**: la puerta ignora cualquier confirmación que no corresponda a un aviso salvable, y el motor corrige a «no confirmable» cualquier freno que no sea un aviso, por si una regla nueva viniera mal marcada. Hay test.
- **Las claves de aviso se acotan en la ruta** (como mucho 20, y solo minúsculas, dígitos y guiones): no son texto libre.
- **Ninguna ruta encola una generación sin pasar por el motor**, comprobado de dos formas: un test que recorre el código y exige que todo fichero que llama al encolado pase por la puerta, y un test de integración que cuenta que cada trabajo encolado deja exactamente una evaluación.
- **Los mensajes no revelan el prompt** (ADR-0022): lo que sale hacia el navegador son motivos y acciones escritos para el usuario. Hay test.

### Actualizar desde la 0.17.0

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La `0018` crea la tabla `control_evaluations` y sus dos tipos enumerados; no toca ninguna tabla existente y no hay nada que migrar.
- **No hay que configurar nada para que funcione.** Los tres ajustes nuevos traen valores por defecto y el panel aparece solo.
- **Cuando el precio de un modelo pase de 90 días sin comprobarse**, generar con él pedirá confirmar el aviso. Si prefieres que no, apaga «Avisar si el precio del modelo es antiguo» en Admin › Ajustes › Controles previos; lo razonable es volver a comprobar el precio.
- **El aviso de cobertura de vistas llega apagado.** Encendido, generar con un personaje al que le falte alguna vista mínima exige confirmarlo. Enciéndelo si usas la captura guiada de 0.14.0.
- **Producir una escena con afirmaciones sin verificar ya no pasa.** Antes solo bloqueaban las de salud, y solo al aprobar el plan; ahora cualquier afirmación `por_verificar` de la escena la deja en «Requiere revisión». Resuélvelas (verificar con fuente, corregir o descartar) antes de producir.
- **«Crear» no cambia** en lo demás: si trabajas como hasta ahora y todo está en orden, el panel dice «Listo» y el botón se comporta igual.

## [0.17.0] · 2026-09-27

### Decisiones firmes del propietario (2026-09-27)

- **Los prompts van siempre en inglés, y la traducción la hace el servidor.** Lo que escribes en español —la
  escena, los campos de la ficha del personaje y su descripción, y el guion— se traduce con el modelo de texto de
  KIE **antes de componer el prompt**. **Lo que dice el personaje no se traduce**: tiene que sonar en el idioma en
  que se escribió. Es una llamada de pago y recorre el camino de dinero completo: entra en la estimación (como un
  coste aparte y como un máximo, con su precio y su fecha), reserva antes de llamar, tiene tope y presupuesto,
  aplica la **lista blanca de rechazos** y apunta el consumo que informa el proveedor. **Se cachea por huella del
  texto de origen, por usuario**: lo mismo no se paga dos veces, y la caché no es global porque lo que se traduce
  son datos personales de alguien (la ficha describe a una persona). Si la traducción falla, **no se envía la
  generación** y se dice con esas palabras. Mientras el modelo de texto siga `descubierto`, vive detrás del ajuste
  «Traducir los prompts al inglés», **apagado de fábrica** (apagado se envía el texto original, como en la 0.16.x):
  para cumplir la decisión hay que validar el modelo con una prueba real y encenderlo.
- **El prompt compuesto es material del servidor y del panel de administración** (ADR-0022). Se quitan las cuatro
  pantallas que lo mostraban: «Ver el contexto aplicado» (0.15.0), «Lo que se le enviará al modelo» y «Editar el
  texto final» (0.16.0) y «Prompts de esta escena» (0.17.0). **El prompt no llega al navegador** de un usuario
  normal en ninguna API, payload RSC ni vista, **y tampoco sus piezas**: el fragmento en inglés de cada preset y el
  texto de la plantilla dejan de viajar. Lo que el usuario ve es **lo que ha elegido** (los botones, con su nombre
  en español), de qué versión de su ficha sale el contexto, **qué fotos** se enviarán y el coste; y su propia
  descripción en el historial. **Quien administra sí lo ve**, en `/admin/trabajos`, porque si no un rechazo del
  proveedor no se podría explicar. Queda el ajuste «Mostrar el prompt a los usuarios», **apagado**, preparado para
  los planes de pago. La comprobación del navegador deja de componer: «qué falta por elegir» se calcula con una
  función pura sobre las variables declaradas. **Ni las rutas de presets lo devuelven**: editar o duplicar tu copia
  responde con lo visible, nunca con el fragmento en inglés.
- **El presupuesto autorizado de un proyecto es un tope que se aplica al gastar**, no solo al aprobar: producir una
  escena o llamar al asistente comprueba, **antes de reservar**, que lo que el proyecto lleva comprometido más esto
  cabe en lo autorizado.
- **El coste de la traducción entra en lo que confirmas**: el total que se te muestra y que confirmas es la
  generación **más** la traducción, con la misma función en el navegador y en el servidor, y esa suma es la que se
  mide contra el tope por trabajo y contra el aviso de gasto.
- **Las traducciones de la ficha de un personaje se borran con el personaje**, y el consentimiento dice que al
  generar con él se envían a KIE sus fotos **y el texto de su ficha** (y que, con la traducción encendida, ese texto
  pasa además por su modelo de texto). Recogido en `docs/legal`.

### Añadido

- **Proyectos** (RF05): una idea se convierte en un **concepto**, un **guion por escenas** y un **plan con su coste**, todo editable a mano. `/proyectos` lista los tuyos y `/proyectos/[id]` los trabaja de arriba abajo: idea → concepto → escenas → plan. Desde esta versión una escena pertenece **siempre** a un proyecto.
- **Asistente de guion, opcional y apagado de fábrica.** Con él encendido, propone concepto y escenas a partir de tu idea; sin él, el guion se escribe a mano de principio a fin, que es un camino de primera clase y el que funciona en una instalación recién migrada. Lo que el modelo devuelve es **una propuesta**: se limpia, se guarda como borrador y la revisas tú. Nada de lo que escriba aprueba ni encola nada.
- **El texto también cuesta, y su coste queda en el `UsageLedger`.** La llamada al modelo de texto recorre el mismo camino de dinero que un fotograma: estimación con el precio registrado, confirmación explícita, clave de idempotencia firmada por el navegador, **reserva antes de llamar**, tope por llamada y presupuesto autorizado, límite de ritmo y, al terminar, **consumo con los créditos que informa el proveedor** (`credits_consumed`) y liberación de la reserva. Repetir la misma confirmación devuelve el proyecto tal como está y **no vuelve a llamar al proveedor**.
- **Modelo de texto de KIE** (`gpt-5-6-sol`), con la **misma clave del usuario** que ya guarda la bóveda: no hace falta una segunda credencial y no se reactiva Google (ADR-0009 sigue en pie). Se siembra como `descubierto`, así que **no se puede elegir ni enviar** hasta que quien administra lo ejecute de verdad y lo marque `compatible` en `/admin/modelos` con su evidencia, igual que cualquier otro modelo nuevo.
- **Estimación por escena y total del proyecto**, siempre con la palabra «estimación» y **la fecha del precio** con el que se calculó, y con un **margen prudente** para los modelos que todavía no tienen coste medido y revisado (ADR-0009: el prototipo infraestimó ×3). El margen se dice en la interfaz, no se esconde en la cifra.
- **Presupuesto autorizado por proyecto** (RF14), que se fija al aprobar el plan. Un plan cuyo total estimado se pasa de ahí **no se puede aprobar** sin subirlo, y un plan sin presupuesto fijado tampoco.
- **Tabla de aprobación en zona de claridad**: escena, modelos, duración, coste estimado, total y presupuesto autorizado, con «Aprobar y producir» **deshabilitado mientras falte algo** y la lista de lo que falta a la vista. Aprobar **congela** modelo, sello del precio, versión de la ficha del personaje y versión de la plantilla de cada escena.
- **Afirmaciones que conviene verificar, señaladas en el guion**: cifras, datos presentados como hechos, promesas de salud y resultados prometidos. Se detectan **leyendo el texto, sin llamar a ningún modelo y sin coste**, así que funcionan igual con el guion escrito a mano. Cada una se puede **verificar** (exige escribir la fuente), **corregir** o **descartar**, y una afirmación de salud sin revisar **bloquea la aprobación** (PRD §8). Escenara no comprueba si son ciertas: decide una persona.
- **Edición manual de cada escena y de cada prompt**, reordenar y borrar escenas. Los prompts vacíos los sigue componiendo el servidor con la plantilla, los presets y la ficha, como en 0.16.0.
- Ajustes nuevos en Admin › Ajustes: **asistente de guion activo** (apagado por defecto), **presupuesto por proyecto** (500 créditos) y **margen prudente de la estimación** (30 %). Ninguno vive en `.env`.
- Componentes nuevos en el catálogo `/admin/componentes`: insignias de estado de proyecto, de escena y de afirmación, y la **tabla de aprobación del plan**.
- Guía de usuario [«El asistente de guion»](guias/asistente-de-guion.md), ADR-0020 (modelo de texto del asistente) y ADR-0021 (el proyecto como unidad de trabajo).
- Tests: **sin aprobación explícita del plan no se encola ninguna generación** de imagen ni de vídeo (y no se crea ni trabajo ni reserva); la estimación se muestra por escena y en total con la palabra «estimación» y la fecha del precio (**test de render** de la tabla, no una inspección del código); **editar una escena aprobada invalida su aprobación** y lo indica con su motivo, y a partir de ahí no se puede producir; un plan por encima del presupuesto autorizado **no se puede aprobar** sin subirlo; un total distinto del confirmado tampoco; una afirmación de salud sin revisar bloquea la aprobación y verificar exige fuente; **el coste de la llamada de texto queda en el `UsageLedger`** con los créditos informados por el proveedor; la misma confirmación **no llama dos veces** al modelo ni cobra dos veces; un sello de precio caducado se rechaza en lugar de gastar; lo que devuelve el modelo se guarda **limpio** (no cuela instrucciones ni parámetros del proveedor); proyectos y escenas **solo del dueño** (404 para el resto, también para quien administra) y sus escrituras exigen `Origin` del mismo sitio. Más la lectura de la propuesta, la detección de afirmaciones y las reglas del plan probadas como funciones puras.
- **Traducción de los prompts al inglés** (ver arriba): tabla `translation_cache` por usuario y por huella, ajuste
  `traducirPrompts` y su coste visible en el panel de coste de «Crear».
- **El gasto del asistente cuenta contra el presupuesto del proyecto** y se muestra en la tabla del plan (decisión
  provisional del propietario): es dinero del mismo bote.
- **Barrido de las llamadas de texto que se quedan a medias**: el worker las cierra **conservando la estimación**
  (no se sabe si el proveedor las ejecutó, y soltar lo que quizá se ha pagado sería mentir), y mientras no las
  cierre cuentan como presupuesto **retenido**, con su explicación distinta de la de un trabajo en revisión.
- Tests nuevos: **el prompt no aparece en ningún cuerpo HTTP de un usuario normal** ni en los objetos que las
  páginas pasan al navegador, y **sí lo ve quien administra** (centinela: una frase que solo está en la plantilla);
  la traducción apagada no llama a nadie y encendida envía el texto en inglés, se cachea, no paga dos veces, no
  traduce el diálogo, y **si falla no encola nada** (con la distinción entre rechazo probado y 5xx); el cliente de
  texto traduce cada código HTTP al suyo, descarta el razonamiento y **conserva los créditos informados aunque la
  respuesta sea ilegible**; y la clave de la confirmación es estable mientras no cambie lo que se confirma.

### Cambiado

- `generation_jobs` gana la **escena** de la que sale el trabajo (`scene_id`). Los trabajos del camino rápido de «Crear» siguen naciendo sin escena, y **«Crear» no cambia**: sigue funcionando exactamente como en la 0.16.x.
- `usage_ledger` gana `assistant_run_id`, con su propio índice único por apunte: una llamada del asistente tiene como mucho una reserva, un consumo y una liberación, igual que un trabajo.
- La comprobación de tope por trabajo y de presupuesto disponible se extrae a `exigirPresupuestoDisponible` y la comparten la reserva de un trabajo y la de una llamada del asistente: una sola definición para las dos.
- El contrato de adaptadores gana `generarTexto`, **opcional**: un proveedor sin modelos de texto sigue siendo un adaptador válido y el asistente simplemente no está disponible con él.
- **La cabecera de la aplicación pasa la navegación a su propia fila**, con el mismo criterio que la del admin: con
  «Proyectos» dejaba de caber en una línea a 1920 px y empujaba el selector de tema y «Cerrar sesión» a otra. En
  pantallas estrechas la tira desplaza en horizontal, así que ninguna sección queda inalcanzable.
- `TrabajoVista` deja de llevar el prompt y lleva **la descripción que escribió la persona** (`escena`), que es lo
  que se muestra en el historial. El prompt solo vuelve si se enciende «Mostrar el prompt a los usuarios».
- El contexto aplicado de un personaje deja de llevar el texto y lleva **si la ficha aporta contexto**
  (`conContexto`): lo que el usuario puede arreglar es que esté vacía, no el texto.
- **Duplicar un preset** personaliza su nombre y su descripción; el fragmento en inglés se hereda y se edita en
  Admin › Presets.
- El botón de la aprobación dice **«Aprobar el plan»** y no «Aprobar y producir»: producir llega en la 0.19.0 y
  prometerlo antes es prometer lo que no hay.
- La aprobación de una escena congela además **la versión de la ficha del personaje y la de la plantilla**, y
  `exigirEscenaAprobada` comprueba las tres cosas: sin eso, «lo aprobado sigue valiendo» era una promesa.
- La lista de proyectos se lee con **una sola consulta de escenas** para todas las filas, y en orden descendente por
  última modificación.

### Seguridad

- **Lo que devuelve el modelo de texto es contenido, nunca instrucciones.** Se parsea, pasa por la **misma limpieza anti-inyección** que la ficha (sin saltos de línea, sin caracteres de estructura, sin parámetros del proveedor y sin redirecciones), se recorta a su tope y se guarda como borrador para que lo revise una persona. La idea del usuario viaja al modelo **delimitada y etiquetada como dato**, también limpia.
- **Autorización en el servidor y en la misma consulta**: un proyecto, una escena o una afirmación de otra persona responden 404, y **quien administra no es una excepción** (un guion es trabajo privado de alguien y `/admin` no tiene ninguna pantalla que lo necesite).
- **Ninguna lectura mueve dinero.** Ver un proyecto, su plan o su coste estimado no llama a ningún proveedor ni reserva nada; el único camino que gasta es el del asistente, con su confirmación, su idempotencia y su límite de ritmo, y las escrituras exigen `Origin` del mismo sitio.
- **Aprobar no genera.** La aprobación solo autoriza: `exigirEscenaAprobada` es la puerta por la que pasa cualquier camino que encole una generación desde una escena, y comprueba además que el sello del precio congelado siga siendo el vigente.

### Arreglado

- **La clave de la confirmación del asistente ya no se genera en cada clic**: es estable mientras no cambie lo que
  se confirma (idea, precio y número de escenas), que es lo único que hace que la idempotencia del servidor sirva
  de algo. Un doble clic o un reintento tras un error de red ya no encargaban dos guiones y no se cobran dos veces.
- La petición del asistente **se compone antes de reservar**: leer la ficha del protagonista puede fallar, y una
  reserva apartada por un fallo nuestro le comía presupuesto al usuario.
- **El personaje tiene que poder usarse antes de que su ficha salga hacia el modelo de texto**: si su
  consentimiento se ha revocado desde que se asignó al proyecto, no sale.
- El cliente de texto corta a los **45 s** (antes 90): por encima de eso lo que hay es un problema, y el usuario
  espera con su presupuesto apartado.
- **La migración no crea una escena por clip**: un clip es la animación del fotograma de su escena y hereda la
  suya. La `0018` corrige de forma idempotente lo que agrupó de más la `0017`, renumera sin huecos y deja el
  proyecto heredado como `listo` si todos sus trabajos terminaron.
- El tope de 24 escenas ya no confunde en un proyecto heredado: dice cuántas tiene, en lugar de afirmar un máximo
  que ese proyecto ya se ha pasado.
- **El límite de ritmo del asistente solo cuenta las llamadas nuevas**: reintentar una confirmación que ya se
  ejecutó no gasta cupo.
- El presupuesto de un proyecto se valida con el **mismo tope** al crearlo y al aprobar su plan.
- «Proyectos» vacío solo menciona el proyecto «Sin título» **si existe**, y un plan sin escenas dice que añadas una
  escena en lugar de hablar de precios que no faltan.
- Antes de llamar al asistente se comprueba el **saldo del usuario** en el proveedor, si se conoce.
- **Las rutas de presets ya no devolvían el fragmento del prompt.** Editar y duplicar tu copia responden con la
  vista recortada, y editar solo el nombre **ya no vacía** el fragmento que tenía (antes se mandaba una cadena
  vacía).
- **La traducción va detrás de todas las puertas gratis** también en el fotograma: cuota, saldo, ritmo, decisión
  (medida sobre el texto original, en el idioma de quien escribe) y tope del proyecto. Antes se pagaba una
  traducción para después fallar por cualquiera de ellas.
- Con la traducción ya en marcha en otra petición, **se vuelve a mirar la caché** y se sigue sin pagar si están
  todas; si no, el mensaje **no afirma nada sobre el cobro**, solo que no se ha enviado nada a generar.
- La caché de traducciones se lee **por las huellas que hacen falta** (antes se leía entera), se purga sola cuando
  nadie la usa desde hace más de lo configurado (ajuste nuevo, 180 días) y **se borra con el personaje**.
- **El gasto de texto tiene techo y su exceso se ve**: si el proveedor cobra por encima de lo apartado se apunta en
  la llamada y aparece en `/admin/trabajos`, como el exceso de un trabajo. El modelo de texto cobra por tokens, así
  que pasará.
- Las escenas dejan de guardar dos columnas de prompt que nadie leía: el prompt se compone al producir y el que se
  envió vive en el trabajo.
- Las tres migraciones de esta versión se **fusionan en una sola** (`0017`), que acota los proyectos heredados por
  su idea y no por su título: alguien puede llamar «Sin título» a un proyecto suyo.

### Actualizar desde la 0.16.0

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La `0017` crea `projects`, `scenes`, `claims` y `assistant_runs`, y añade `generation_jobs.scene_id` y `usage_ledger.assistant_run_id`.
- **Tus trabajos anteriores se agrupan en un proyecto «Sin título»**, uno por usuario, con una escena por trabajo en orden de creación y el prompt que se envió de verdad conservado tal cual. No se borra ni se recalcula nada.
- **El asistente llega apagado** (Admin › Ajustes › «Asistente de guion activo»). Para encenderlo hacen falta tres cosas: el interruptor, un modelo `text_generation` **seleccionable** en `/admin/modelos` —el sembrado es `descubierto`, así que hay que ejecutarlo una vez y marcarlo `compatible` con su precio medido— y que cada usuario tenga su clave del proveedor. Sin nada de eso, la pantalla lo dice y el guion se escribe a mano.
- **Revisa el precio del modelo de texto antes de encenderlo.** Se siembra con 3 créditos por respuesta y un margen deliberado: el proveedor documenta 0,48 créditos en su ejemplo, pero el coste depende de los tokens. El consumo real lo informa él en cada llamada y se concilia en el registro de gasto.
- **Fija el presupuesto de cada proyecto.** El plan no se puede aprobar sin él; el valor que se propone al crear sale de Admin › Ajustes (500 créditos por defecto).
- **La versión trae una sola migración, la `0017`**, con todo: proyectos, escenas, afirmaciones, asistente, caché de
  traducciones y la agrupación de los trabajos anteriores (una escena por **fotograma**; un clip hereda la de su
  fotograma). Haz `bun run db:backup` antes, como siempre.
- **La traducción de los prompts llega apagada.** Encenderla exige lo mismo que el asistente: el interruptor, un
  modelo de texto `compatible` en `/admin/modelos` y la clave de cada usuario. Apagada, todo funciona como en la
  0.16.x. Encenderla **añade un coste por texto nuevo**: revisa el precio del modelo antes.
- **El prompt deja de verse.** Si usabas «Editar el texto final», ese camino ya no existe: lo que decides son los
  botones y tu descripción. Quien administra puede consultar el prompt de cualquier trabajo en `/admin/trabajos`.
- **«Crear» no cambia** en lo demás. Si trabajas como hasta ahora, no tienes que tocar nada.

## [0.16.0] · 2026-09-27

### Añadido

- **Crear deja de ser un campo de texto en blanco** (RF04): se elige con **botones** especialidad, formato, look, vestuario, duración y acción. Los botones son el corazón visual de «Crear»; la zona de claridad de lo que se envía al modelo sigue siendo neutra, sin degradados ni movimiento.
- **Seis especialidades, cuatro formatos y cinco looks sembrados**, más vestuarios, duraciones y acciones (decisión provisional del 2026-09-27): moda, fitness, gastronomía, viajes, belleza y mascotas; reel 9:16, story 9:16, cuadrado 1:1 y horizontal 16:9; natural, editorial, nocturno neón, luz dorada y estudio. Todos **editables** desde `/admin/presets`.
- **Nada se ofrece si no se puede generar.** Un formato o una duración que el modelo elegido no admite según el catálogo de 0.11.0 sale **deshabilitado con el motivo escrito** («Nano Banana 2 Lite solo admite 9:16»), y si aun así llegara al servidor se rechaza con 409 **antes de reservar presupuesto o tocar al proveedor**. Es la **misma función** de comprobación en la botonera y en el servidor. Hoy todos los modelos de imagen del catálogo admiten solo 9:16, así que el 1:1 y el 16:9 se siembran pero se ven bloqueados: el catálogo es editable y el día que entre un modelo con 1:1 dejarán de estarlo. El selector de formato por plataforma y el 4:5 siguen siendo de 0.26.0.
- **Todas las variables de tipo `texto` de una plantilla reciben la escena**, no solo la que se llame «escena»: en «Crear» hay un solo campo de descripción, así que una plantilla que llame a su variable `lo_que_se_ve` funciona igual. Lo reparte la **misma función** en el servidor y en la previsualización.
- **El texto final se ve antes de gastar y se puede editar.** Mientras se edita, lo que se muestra es el texto **ya limpio** —el mismo que se enviará— y se avisa si la limpieza ha quitado algo, en lugar de hacerlo en silencio. Zona de claridad con el prompt tal cual, en inglés (los modelos responden mejor) con las descripciones en español, y «Editar el texto final» para cambiarlo a mano. La previsualización se calcula **en el navegador con la misma función pura que compone el servidor**, igual que la limpieza de la ficha: lo que se ve es lo que se enviará, sin una petición por cada clic y sin que ninguna lectura mueva dinero.
- **Plantillas de prompt versionadas** (`prompt_templates` y `prompt_template_versions`): texto con variables `{{así}}`, variables tipadas (texto, enumerado de una categoría de preset, número y referencia al personaje), restricciones por modelo, capacidad de destino y estado. Se administran en `/admin/plantillas`, con previsualización y **historial de versiones** con su motivo y su autor.
- **La confirmación cita la versión de la plantilla y tiene que ser la vigente**: si quien administra la editó entre la pantalla y el botón, se responde **409** («La plantilla ha cambiado: revisa el texto y confirma otra vez») **antes** de reservar presupuesto o tocar al proveedor, igual que con la versión de la ficha. El **reintento con la misma clave sigue devolviendo el trabajo que ya existe**, porque el corte por idempotencia va antes de componer.
- **La plantilla tiene que declarar la capacidad del tipo de trabajo**: una de fotograma no se puede usar en un clip ni al contrario (409 con su motivo). Cruzarlas compondría un prompt que no describe lo que se va a generar, y se pagaría igual.
- **Cada trabajo cita su plantilla y su versión** (`generation_jobs.prompt_template_id`, `prompt_template_version_id`) y guarda el prompt **ya compuesto**, que es el que se envía. **Editar una plantilla no cambia lo que ya se generó**: es la misma regla que la ficha del personaje en 0.15.0 (ADR-0018), por el mismo motivo. `prompt_edited` marca los trabajos cuyo texto final editó el usuario.
- **Cada usuario puede duplicar un preset de la instalación para hacerlo suyo** desde «Crear». La copia nace activa, apunta al original, se marca como «Tuyo» y **solo la ve él**; editarla no toca la de la instalación. Compartir presets y plantillas entre cuentas sigue siendo de 0.28.0.
- **Admin › Presets** y **Admin › Plantillas**: alta, edición, orden, activar y desactivar, con previsualización. Quien administra edita **solo lo de la instalación**: un preset de un usuario responde 404 aunque quien pida el cambio sea administrador.
- Semilla versionada en `apps/web/src/server/prompts/presets.json`, idempotente y que **no pisa** lo que haya cambiado quien administra: solo crea lo que falta. Se aplica al migrar, como la del catálogo de modelos.
- Componentes nuevos en el catálogo `/admin/componentes`: la **botonera de presets** (con la variante deshabilitada y su motivo, y el distintivo «Tuyo») y la **zona de claridad del prompt final**, con su estado de «falta elegir».
- Guía de usuario [«Presets y plantillas»](guias/presets-y-plantillas.md) y nota en la guía de contribución sobre cómo añadir presets a la semilla.
- ADR-0019: prompts en inglés, compuestos en el servidor y con versión citada.
- Tests: la semilla crea al menos 6 especialidades, 4 formatos y 5 looks y **sembrar dos veces no duplica nada**; el prompt renderizado es **determinista** (el orden de la selección no cambia el texto) y **no permite inyectar instrucciones fuera de las variables declaradas** (parámetros del proveedor, redirecciones y variables metidas dentro del valor de otra, comprobado sobre el prompt que recibe el proveedor simulado); una variable obligatoria sin valor **impide continuar con su motivo y no encola nada**; una combinación preset + modelo imposible se bloquea **antes de encolar** (se comprueba que no se ha creado ningún trabajo); el trabajo conserva plantilla, versión y prompt final, y editar la plantilla **no cambia** lo ya generado, mientras que un trabajo nuevo sí lleva el cambio; confirmar con una versión concreta usa esa versión y no la vigente; un preset desactivado no se puede usar ni se ofrece; un preset de otro usuario responde 404 al leerlo, al duplicarlo y al generar con él; quien administra no puede editar el de un usuario, y un usuario no puede editar el de la instalación; duplicar sin `Origin` del mismo sitio responde 403 y sin sesión, 401; un preset colado en el hueco de otra categoría se rechaza; y **sin plantilla, generar sigue funcionando exactamente como en la 0.15.x**. Más la interpolación, la limpieza del texto editado, el orden determinista de los presets y la compatibilidad con el modelo probadas como funciones puras.

### Cambiado

- `generation_jobs` gana la plantilla citada, su versión y la marca de texto editado. Los trabajos anteriores no citan ninguna plantilla (`null`) y eso es a propósito: se hicieron sin ella.
- La **plantilla, su versión, los presets elegidos y el texto editado entran en la firma de la confirmación** de «Crear». Si cambia cualquiera de los cuatro, lo confirmado deja de ser lo mismo y la clave de idempotencia se renueva: no se reutiliza la confirmación de otro prompt.
- `limpiarCampoFicha` se apoya ahora en `limpiarTextoDePrompt`, la misma limpieza con el tope como parámetro: el texto final de una plantilla es más largo que un campo de la ficha, pero las reglas son idénticas. Una sola definición para los dos sitios.
- **La cabecera del admin se reorganiza**: la navegación pasa a su **propia fila**, agrupada en «Contenido», «Generación» y «Sistema». Con nueve secciones, una sola tira de píldoras dejaba de caber incluso a 1920 px y empujaba el selector de tema y «Mi cuenta» a otra línea. Ahora el orden es el mismo a cualquier ancho, en pantallas estrechas los grupos se apilan y cada uno desplaza en horizontal, y el estado activo (`aria-current="page"`) sigue viéndose sin abrir ningún menú.
- Los presets de 6 y 8 segundos explican en su descripción por qué solo se pueden elegir si su precio está medido: el proveedor cobra **por unidad** («vídeo de 4 s»).
- Editar **tu copia** de un preset conserva su orden y su estado: el formulario de «Crear» no los ofrece, así que no se pueden reordenar ni reactivar sin querer.

### Seguridad

- **El prompt lo sigue componiendo el servidor**, ahora también con plantillas: el navegador manda **identificadores** de plantilla, de versión y de preset, nunca el texto compuesto. Lo único que puede mandar como texto es la escena y el texto final editado, y los dos pasan por la **misma limpieza anti-inyección** que la ficha (sin saltos de línea, sin caracteres de estructura, sin parámetros del proveedor y sin instrucciones de redirección).
- **Solo se sustituyen las variables declaradas**, en una sola pasada: un `{{inventada}}` que la plantilla no declare se borra, y **un valor no puede introducir más variables**, porque lo sustituido no se vuelve a recorrer.
- **Una variable de tipo `personaje` solo puede valer una de dos cadenas fijas** («the same person…» / «the same animal…»): el nombre de la persona nunca sale hacia el proveedor por esta vía.
- **La proporción y la duración no viajan dentro del prompt: viajan como restricción comprobable** contra el catálogo del modelo. Es doblemente necesario, porque la limpieza quita del prompt cualquier medida de salida escrita en texto («9:16», «1080p») **venga del usuario o del propio preset**: el texto describe el encuadre en palabras y la proporción real la decide el catálogo. La duración exigida tiene que ser además **la que se le envía de verdad al proveedor**, que es la unidad con la que está medido el precio: ofrecer 8 s con el precio de 4 s sería mentir en la estimación.
- **Autorización en el servidor, no en la interfaz.** Un preset o una plantilla de otro usuario responde 404 en toda lectura y en toda escritura (IDOR); quien administra solo puede cambiar los de la instalación (`owner_id` nulo), comprobado en la propia consulta de actualización; y un usuario no puede editar los de la instalación: tiene que duplicarlos. Cada acción del admin vuelve a exigir el rol contra la base de datos, porque una acción se puede invocar sola.
- **Duplicar exige `Origin` del mismo sitio** y lleva límite de ritmo (30 por minuto), porque escribe una fila y nadie la borra sola. Y hay tope de copias propias por usuario, para que una cuenta no pueda llenar la tabla desde un bucle.
- **El tope de variables y el de longitud de la plantilla se comprueban antes de iterar y antes de que ninguna expresión regular recorra el texto.** Al guardar una plantilla, cada variable se valida **una a una diciendo cuál falla** (nombre, tipo, categoría y etiqueta), y unas llaves mal escritas (`{{Escena}}`, `{{mi-variable}}`, una llave suelta) se rechazan al guardar en lugar de desaparecer sin avisar al renderizar.
- **El tope de copias propias se comprueba dentro de la transacción del duplicado**, con la fila del usuario bloqueada: dos duplicados a la vez contarían los dos contra el mismo estado anterior.
- **Los presets elegidos se leen y se autorizan en una sola consulta** filtrada por dueño, no en un bucle de lecturas: lo que no sale en esa lectura no existe para ese usuario.
- **Todo lo que llega del navegador se acota antes de consultar nada**: los identificadores se comprueban como UUID, la selección tiene tope por categoría y en total, y el tope de longitud del texto editado se aplica **antes** de cualquier expresión regular.
- Los valores de un preset y las variables de una plantilla se guardan como JSON en texto y **se validan con el mismo código que los lee**, como los parámetros del catálogo: una fila ilegible se trata como «sin valores», nunca como «vale cualquier cosa», y ni la semilla ni el admin pueden colar algo que no se entienda.
- Ninguna garantía anterior se ha tocado: el sello de precio, la reserva atómica, el tope de trabajos simultáneos, la versión citada de la ficha, las puertas de consentimiento y «ninguna ruta de lectura mueve dinero» siguen igual. La ruta que devuelve presets y plantillas es de lectura y no encola nada.

### Actualizar desde la 0.15.0

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La `0016` crea `presets`, `prompt_templates` y `prompt_template_versions`, y añade a `generation_jobs` la plantilla citada, su versión y la marca de texto editado. Ningún dato existente se modifica.
- **La migración siembra el catálogo inicial** de presets y plantillas de la instalación desde `presets.json`, igual que la del catálogo de modelos. Es idempotente y no pisa nada de lo que ya hubiera.
- **Los trabajos anteriores no citan ninguna plantilla** y se quedan tal como estaban: se hicieron sin ella.
- **Generar sin plantilla sigue funcionando igual.** Si esta instalación no tiene ninguna plantilla activa para un tipo de trabajo, «Crear» envía la descripción tal cual, como en la 0.15.x. Con plantilla, lo que escribes pasa a ser **una de sus variables** («qué quieres ver») y el resto lo ponen los botones.
- **Revisa los formatos antes de prometer nada.** Los presets de 1:1 y 16:9 se siembran activos, pero hoy ningún modelo de imagen del catálogo los admite: se ven deshabilitados con su motivo. Si los quieres usar, hay que registrar en Admin › Modelos un modelo que los declare.

## [0.15.0] · 2026-09-27

### Añadido

- **Ficha de personaje** (RF02): cinco campos de apariencia —rasgos físicos, estilo visual, vestuario habitual, personalidad y voz prevista— en la pestaña «Ficha» de `/personajes/[id]`, junto a «Referencias» y «Versiones». La voz **solo se declara** aquí: la voz real sigue siendo de 0.21.0.
- **La ficha no es archivo: es contexto de generación.** Su texto —los cinco campos **y la descripción**— se añade al prompt del fotograma **y del clip**, junto con las mejores fotos del personaje, así que la identidad ya no depende solo de lo que las fotos alcanzan a decir (ADR-0018). El bloque lo **compone el servidor** con rótulos fijos a partir de la versión citada; el navegador no manda texto por ahí.
- **Las referencias se eligen por cobertura de vistas, no por orden de llegada**: primero una foto original de cada vista mínima, luego las demás originales y al final las vistas generadas, recortando al tope que declare el modelo (10 en el modelo de imagen predeterminado). Con diez huecos y quince fotos se envía una de cada ángulo en lugar de diez del mismo.
- **El usuario ve exactamente lo que se va a enviar antes de confirmar**: en «Crear», una zona de claridad con el bloque de contexto tal cual y las miniaturas de las fotos elegidas con su vista. Es una **lectura**: no encola nada, no reserva presupuesto y no toca a ningún proveedor. Llegando desde la ficha con el personaje ya elegido, el contexto se resuelve en el servidor y está puesto al cargar la página.
- **Versiones de la ficha** (`character_versions`): número correlativo, instantánea completa de la ficha y la descripción, referencias incluidas, hoja de personaje, quién y cuándo, motivo del cambio y **qué campos cambiaron**. Historial en la pestaña «Versiones» con el motivo, las etiquetas de lo que cambió y cuántas aprobaciones invalidó cada versión, más **comparación lado a lado** de dos versiones cualesquiera (cada fila cambiada lleva su etiqueta «Cambia», nunca solo color).
- **Cada trabajo cita su versión** (`generation_jobs.character_version_id`) y guarda el prompt **ya compuesto**, que es el que se envía. Un fotograma hecho con la versión 2 sigue apuntando a la 2 —y sigue llevando el contexto de la 2— después de crear la 3. El clip hereda **la versión de su fotograma**, no la vigente: animar tiene que seguir siendo el mismo personaje que se generó.
- **Hoja de personaje**: montaje en cuadrícula de hasta nueve de sus fotos, con el nombre arriba y la vista debajo de cada una, compuesto **en el servidor con `sharp`, sin IA y sin coste**. Se guarda en la biblioteca del usuario y se asocia a la versión vigente; rehacerla dentro de la misma versión **sustituye** la anterior (fila y objeto) en lugar de acumular cuota. Regenerarla es gratis, así que no hay ninguna confirmación de gasto.
- **La confirmación cita la versión de la ficha**: si entre la pantalla y el botón se ha creado otra —otra pestaña que guardó la ficha, una vista sintética que terminó y cambió las referencias—, el envío se rechaza con 409 («La ficha ha cambiado desde que la revisaste») **antes** de reservar presupuesto o tocar al proveedor, en lugar de gastar en una apariencia que nadie ha revisado.
- **La hoja de personaje es material reservado**, como las fotos de referencia: quien administra no la ve en `/admin/medios` ni por `/api/media/*`. Es un montaje hecho con esas mismas fotos, así que se trata igual que ellas.
- **Aprobaciones invalidables** (`character_approvals`, base de 0.17.0 y 0.20.0): se registran contra la versión vigente y, al crear una versión nueva, quedan invalidadas con **bandera, fecha, qué la causó y la acción concreta que hace falta** («vuelve a revisar la escena: se aprobó con una apariencia que ya no es la vigente»). La pestaña «Versiones» las muestra arriba, en rojo y con texto.
- Componentes nuevos en el catálogo `/admin/componentes`: la zona de claridad del **contexto que se enviará al modelo** y la variante del anillo de historia **sin pie**, para cuando el nombre y el estado ya están al lado. Las pestañas y el selector ya estaban.
- Guía de usuario [«La ficha y las versiones de un personaje»](guias/ficha-y-versiones-de-personaje.md).
- Tests: cambiar un campo de apariencia crea versión, incrementa el número y registra el motivo, mientras que cambiar solo el nombre —o guardar el mismo texto otra vez— **no crea ninguna**; añadir una foto sí versiona; crear versión invalida las aprobaciones dependientes con bandera y fecha, comprobado también en la base de datos; el prompt enviado lleva el contexto de la versión citada y **no** el de otra, comprobado sobre el cuerpo que recibe el proveedor simulado; la hoja de personaje se compone **sin una sola llamada al proveedor** y sin crear ningún trabajo, y rehacerla borra la anterior; borrar el personaje borra sus versiones y su hoja; versiones, hoja y contexto son del dueño (404 para quien administra, salvo el historial sin ficha ni hoja en los personajes con consentimiento de tercero); sin `Origin` del mismo sitio no se edita la ficha ni se compone la hoja; confirmar con una versión que ya no es la vigente responde 409 y no encola nada, en los dos escenarios (edición en otra pestaña y versión creada por una vista sintética); dos composiciones de la hoja a la vez dejan **una sola**, la que apunta la versión; la hoja no la ve quien administra ni por la ruta del medio ni en el listado de la biblioteca; la descripción llega al prompt; y una lectura del contexto o del historial **no escribe** ninguna versión. Más la limpieza del texto, la composición del bloque, las diferencias entre versiones y la elección por cobertura probadas como funciones puras.

### Cambiado

- `characters` gana los cinco campos de la ficha (`traits`, `style`, `wardrobe`, `personality`, `voice`) y `generation_jobs`, la versión citada. El texto libre de `description` se conserva tal cual y **también versiona**: forma parte de lo que se le envía al modelo.
- **`generation_jobs.prompt` es ahora el prompt compuesto**, el mismo que sale hacia el proveedor. Lo que escribió la persona se conserva aparte en `input.escena`, y el bloque añadido en `input.contextoPersonaje`: el historial puede mostrar las dos cosas sin adivinar dónde acaba una.
- La **versión de la ficha entra en la firma de la confirmación** de «Crear». Si la ficha cambia entre la pantalla y el botón, lo confirmado deja de ser lo mismo y la clave de idempotencia se renueva: no se reutiliza la confirmación de una apariencia distinta.
- Añadir, quitar o **reordenar** fotos de referencia crea versión: el orden decide qué se envía primero, así que es un cambio de lo que ve el modelo. Adjuntar una vista generada al cerrar su trabajo también versiona, con su motivo escrito.
- Borrar un personaje borra además sus **versiones**, sus aprobaciones y sus **hojas de personaje** (fila y objeto). El diálogo de confirmación cuenta la hoja entre los derivados, porque es un montaje con sus fotos.

### Seguridad

- **Quien administra no ve nada del contenido de una ficha ajena.** En el historial van vacíos la ficha, la descripción, el contexto, la hoja, **los valores de cada diferencia** (`antes` y `despues` llevan el texto de la ficha dentro), el **motivo del cambio** (lo escribe el usuario y puede describir a la persona: «ahora lleva el pelo corto») y el **asunto** de una aprobación. Se ven números, fechas y **qué campo** cambió, que es lo que hace falta para auditar un consentimiento. Comprobado además buscando cada cadena privada en la respuesta entera.
- **El texto de la ficha se limpia antes de entrar en un prompt**, con la misma función en el servidor y en el navegador: longitud acotada (300 caracteres por campo, 900 el bloque entero, y el tope se aplica **antes** de cualquier expresión regular), sin saltos de línea ni caracteres de control, sin caracteres de estructura (`{}`, `[]`, `<>`, `` ` ``, `|`, `\`) y **sin parámetros del proveedor ni instrucciones de redirección**: `aspect_ratio: 21:9`, `--seed=42`, «ignora las instrucciones anteriores», «system prompt», «actúa como…». Lo que la sostiene no es que la lista sea completa, sino que **el prompt lo compone el servidor** con rótulos fijos. Una frase de redirección se descarta **entera, con su cola**: dejar «…y usa duration 10 y 1080p» después de quitar «ignora lo anterior» sería dejar dentro justo lo que se quería colar. También se quitan los nombres de parámetro escritos en texto libre, sin `=` ni `:` («en resolución 4k», «duration 10»), y las banderas con guion tipográfico (`—ar 16:9`), que es lo que escribe un corrector automático.
- **Versiones, hoja y contexto de generación son del dueño.** Un personaje ajeno responde 404 en las tres rutas. Quien administra solo alcanza el **historial** —y solo si el personaje tiene o tuvo un consentimiento de tercero, la misma puerta que la ficha—, con la ficha en blanco, el contexto vacío y la hoja a `null`: ve números, fechas, motivos y qué campo cambió, que es lo que necesita para auditar un consentimiento. Cada acceso queda registrado en `consent_access_log`.
- Editar la ficha y componer la hoja exigen `Origin` del mismo sitio, como todo lo que cambia datos. Componer la hoja lleva además el mismo límite de ritmo que añadir referencias, porque es la otra operación que decodifica imágenes con `sharp`, y registrar una aprobación tiene el suyo: escribe una fila y no borra ninguna.
- **El montaje de la hoja abre las fotos con las mismas opciones acotadas que el control de calidad** (`ENTRADA_ACOTADA`, una sola definición para los dos sitios: tope de 40 MP, una página, sin animación) y las decodifica **de tres en tres**, no las nueve a la vez.
- **El intercambio de la hoja va en una transacción con la fila de la versión bloqueada**, y se borra la que devuelve esa lectura: dos composiciones a la vez no pueden dejar una hoja apuntada sin dueño (fuga de cuota) ni borrar las dos la misma y dejar la versión apuntando a un medio inexistente.
- **Las lecturas no escriben.** Ni el historial ni el contexto crean versiones: la versión 1 la pone el alta del personaje y, para los que ya existían, el relleno de la migración `0015`.
- Ninguna garantía anterior se ha tocado: la reserva atómica, el sello de precio, el tope de trabajos simultáneos, el estado `enviando`, la revalidación del consentimiento en el despacho y «ninguna ruta de lectura mueve dinero» siguen igual. La ruta que muestra el contexto es de lectura y no encola nada.

### Actualizar desde la 0.14.0

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. La `0014` crea `character_versions` y `character_approvals`, añade los cinco campos de la ficha a `characters` y la versión citada a `generation_jobs`. La `0015` añade la marca de hoja de personaje a `media` y **rellena la versión 1** de los personajes que ya existían, con lo que tienen en ese momento y con la fecha de creación del personaje. Ningún dato existente se modifica.
- **Los personajes nuevos nacen con su versión 1**, y los antiguos la reciben en el relleno de la `0015`.
- **Los trabajos anteriores no citan ninguna versión** (`character_version_id` a `null`) y eso es a propósito: se hicieron sin contexto de ficha, así que no se les inventa uno. Sus prompts se quedan tal como estaban.
- **La ficha empieza vacía, pero la descripción no.** Si tus personajes ya tenían descripción, **ese texto empieza a ir en cada prompt** desde esta versión: revísalo en «Ver el contexto aplicado» antes de generar. Con la ficha y la descripción vacías, generar funciona exactamente igual que en la 0.14.0. En cuanto escribas algo, ese texto empieza a ir en cada fotograma y en cada clip: revísalo en «Ver el contexto aplicado» antes de generar.
- **La hoja de personaje ocupa cuota** de la biblioteca del usuario, como cualquier otro medio suyo. Hay una por versión y rehacerla sustituye la anterior.

## [0.14.0] · 2026-09-27

### Añadido

- **Captura guiada de referencias** (RF03): la ficha del personaje dice **qué vista falta**, y se hace ahí mismo. El visor usa el **marco «Enfoque»** de la marca como encuadre, con la silueta de la vista pendiente dentro y la indicación de lo que hay que hacer («gira la cabeza del todo a tu izquierda, hasta ver la oreja»). Funciona con la cámara frontal y con la trasera, y para quien no da permiso de cámara (o no tiene) hay subida de archivo con exactamente la misma guía. Todo es accesible por teclado, y la silueta animada se queda quieta con `prefers-reduced-motion`.
- **Panel de cobertura de vistas** por personaje. Las vistas mínimas son cinco en personas —de frente, perfil izquierdo, perfil derecho, tres cuartos y cuerpo completo— y tres en animales —de frente, de perfil y cuerpo completo—. La cobertura **informa, no bloquea**: lo que decide si un personaje puede generar sigue siendo el mínimo de fotos de Admin › Ajustes. Se calcula a partir de los datos, así que cambiar las vistas mínimas no exige migrar nada.
- **Control de calidad de cada foto, local y sin gastar un solo crédito**: resolución, enfoque por varianza del laplaciano y luminancia media, medidos con el mismo `sharp` que ya reduce las imágenes al subirlas. El navegador mide **antes de subir** con los mismos umbrales, así que una foto borrosa se repite sin haber ocupado cuota; y el servidor la vuelve a medir, porque lo que decide es el servidor. La revisión con modelo multimodal sigue siendo de 0.20.0: aquí no participa ninguno.
- **Cada rechazo dice qué pasa y qué hacer**: «poca luz → ponte de cara a una ventana», «foto borrosa → sujeta el móvil con las dos manos y espera a que enfoque», «cara pequeña → acércate». El tamaño mínimo (y una imagen con el lienzo inmenso) son los únicos **límites duros**; los demás avisos se pueden saltar con «usarla de todas formas», y entonces la referencia **conserva todos los motivos** y la ficha los sigue diciendo.
- **Detección de fotos repetidas por huella perceptual** (dHash de 64 bits, guardada en `character_references.phash`): subir dos veces la misma foto —o una casi idéntica, la misma con otra exposición— avisa de duplicado y **no crea una segunda referencia**, ni siquiera forzándola. Se compara dentro del personaje, contra lo que ya tiene y contra las de la misma petición.
- **Tamaño relativo de la cara medido en el navegador** con `FaceDetector`, donde exista. No está en todos los navegadores, así que **solo avisa**: donde no hay detector se comprueban tamaño, enfoque y luz, y se dice expresamente que la cara no se ha comprobado. Nunca es un bloqueo.
- **Vistas sintéticas**: si falta una vista, se puede **generar** a partir de las fotos que ya hay. No es un camino aparte: es un fotograma normal de la cola, con la reserva de presupuesto, la confirmación del coste, la clave del propio usuario y **las mismas puertas de consentimiento** que «Crear» (consentimiento vigente, revisión de referencias de ADR-0009 y revalidación en el despacho). La indicación que se le manda al proveedor **la escribe el servidor** a partir de la vista: por aquí no entra texto libre junto a las fotos de una persona.
- **La misma confirmación nunca se cobra dos veces.** La clave de idempotencia de una vista sintética se conserva mientras no cambie lo que se confirma (vista, precio y créditos), como en «Crear»: reintentar tras un fallo de red reenvía la **misma** clave y el servidor devuelve el trabajo que ya creó. Y la idempotencia se comprueba **antes** que la cobertura, así que repetir una confirmación cuyo trabajo ya terminó devuelve ese trabajo en lugar de un «esa vista ya la tienes». Ante un fallo de red se dice lo que de verdad se sabe: puede haberse encargado, revisa el historial antes de repetir.
- **Una vista generada nunca se presenta como foto.** Nace marcada `vista_generada`, hereda el `character_id`, lleva su distintivo **sobre la propia miniatura** (icono y texto, no solo color), no puede ser la portada del personaje y **no cuenta para el mínimo de fotos originales**: el mínimo cuenta solo `foto_original`, en la ficha, en los listados, en la puerta de la generación y en la revalidación de la cola. Solo se ofrece para una vista que falta **y que no tenga ya una generada**: una vista cubierta —por una foto o por una generada anterior— responde 409 con su motivo en lugar de gastar créditos. Y **reañadirla desde la biblioteca no la convierte en foto**: el servidor comprueba si el medio es resultado de un trabajo de la cuenta y, si lo es, la guarda otra vez como `vista_generada` con la vista que pidió el trabajo.
- **Admin › Ajustes › Calidad de las fotos de referencia**: lado menor mínimo (512 px), enfoque mínimo (8), horquilla de luz (45–225) y tamaño mínimo de la cara (12 %). Con valores por defecto y en el panel, no en `.env` (ADR-0013). La horquilla de luz se valida cruzada: un mínimo por encima del máximo rechazaría todas las fotos, así que no se puede guardar.
- **Sin clave utilizable de KIE no se ofrece generar ninguna vista**: se dice qué falta y se enlaza «Tu cuenta», igual que en `/crear`. Hacer las fotos no necesita ninguna clave y sigue funcionando.
- Componentes nuevos en el catálogo `/admin/componentes`: el marco «Enfoque» con la silueta de cada vista, el distintivo de origen de una referencia y la lista de motivos de rechazo con su acción.
- Guía de usuario [«Buenas referencias»](guias/buenas-referencias.md).
- Tests: una foto borrosa, oscura o pequeña se rechaza con su motivo y **no se guarda** (comprobado también en la base de datos); «usar de todas formas» guarda la foto **con el motivo anotado**, y el mínimo técnico no se puede saltar ni forzándolo; la misma foto dos veces —y una casi idéntica— avisa de duplicado y deja una sola referencia, también dentro de una misma petición; la cobertura dice exactamente qué vista falta, distinta en personas y en animales, y una foto sin vista cuenta para el mínimo sin cubrir ninguna; una vista generada no cuenta como foto original, no cubre la vista y su etiqueta llega hasta el **render** de la interfaz; pedir una vista sintética sin consentimiento, sin la revisión de referencias, con otro coste, con una vista inventada o sin `Origin` no encola nada. Más las medidas de calidad y la huella perceptual probadas como funciones puras: los umbrales caen siempre del mismo lado, y la huella sobrevive a reescalar y recomprimir sin confundir dos fotos distintas.

### Cambiado

- `character_references` guarda la vista normalizada (`view_key`), las medidas de calidad (`width`, `height`, `sharpness`, `brightness`, `face_ratio`), la huella perceptual (`phash`) y el motivo con el que se marcó la foto (`rejection_reason`). El campo libre `declared_view` de 0.13.0 se conserva tal cual.
- **El origen de una referencia ya no lo puede elegir el navegador.** Al añadir fotos desde la biblioteca, el servidor las guarda siempre como `foto_original`; `vista_generada` la pone **solo** el cierre de un trabajo de vista sintética. Si el navegador pudiera elegir, la etiqueta no probaría nada.
- La portada de un personaje y las miniaturas de los listados salen siempre de una **foto original**: en un listado no hay sitio para una etiqueta al lado, y una imagen generada ahí parecería una foto de la persona.
- Sin detección real de la vista (haría falta un modelo, que es de 0.20.0), la vista que se guarda es **la que pidió la guía** o la que eligió el usuario. Se dice así en lugar de llamarla «detectada».

### Seguridad

- **El análisis está acotado en píxeles y en ritmo.** Cada imagen se abre con tope de píxeles (40 MP) y una sola página (`pages: 1`), y el tamaño se comprueba **en la cabecera**, sin decodificar: un archivo de 66 bytes que declare un lienzo de 50.000 × 50.000 px (o un GIF de mil fotogramas) no puede convertir una subida en un bloqueo del servidor. Además, cada foto se decodifica **una sola vez** —de la copia reducida salen las tres medidas y la huella— y añadir referencias lleva límite de ritmo por usuario, porque es la única operación de personajes que cuesta CPU.
- **El origen de una referencia lo decide el servidor comprobando los trabajos de la cuenta**, no la etiqueta que llegue del navegador: una imagen generada reañadida desde la biblioteca vuelve a entrar como vista generada y no sube el recuento de fotos originales, que es el que sostiene el mínimo del personaje.
- Los duplicados se comprueban **otra vez dentro de la transacción**, con la fila del usuario ya bloqueada: dos peticiones a la vez midieron las dos contra el mismo estado anterior y sin eso las dos guardarían la misma foto.
- **El análisis de las fotos no sale de la máquina de nadie**: el navegador mide sobre un lienzo que descarta al terminar, y el servidor sobre los bytes que ya tiene guardados. De una foto solo se conservan cuatro números y una huella de 64 bits que **no permite reconstruirla**, solo comparar dos fotos entre sí. Nada de esto se escribe en el registro del servidor, y un fallo al medir se registra sin el nombre del archivo.
- La vista, la proporción de cara y el «usar de todas formas» llegan del navegador, así que se validan en el servidor: una vista que no está en el catálogo responde 400 y una proporción fuera de 0–1 también. El «usar de todas formas» **no abre** el mínimo técnico ni el duplicado.
- Pedir una vista sintética exige `Origin` del mismo sitio, como todo lo que cambia datos, y responde 404 para un personaje ajeno. El tope de referencias se comprueba **antes** de gastar créditos: generar algo que no se podría guardar sería pagar por nada.

### Actualizar desde la 0.13.0

- **Aplica la migración antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. Añade a `character_references` la vista normalizada, las medidas de calidad, la huella perceptual y el motivo de marcado, más un índice por personaje y huella. No toca ni un dato existente.
- **Las referencias que ya tienes se quedan sin medidas ni huella** (`null`), y eso es a propósito: no se han medido, así que no se inventa nada. Siguen contando como fotos originales y siguen sirviendo para generar. Si quieres que entren en la cobertura de vistas, vuelve a añadirlas desde la captura guiada indicando su vista.
- **Revisa Admin › Ajustes › Calidad de las fotos de referencia** antes de que nadie suba nada. Con el lado mínimo en 512 px, una foto más pequeña **deja de poder añadirse** como referencia (las que ya estén guardadas no se tocan). Si tu gente trabaja con fotos pequeñas, baja ese número; los demás umbrales siempre se pueden saltar con «usar de todas formas».
- Las **vistas generadas no cuentan** para el mínimo de fotos de un personaje. Ninguna referencia anterior es una vista generada, así que ningún personaje cambia de estado al actualizar.

## [0.13.0] · 2026-09-27

### Añadido

- **Personajes** (RF02): una persona o un animal con sus fotos de referencia y su registro de consentimiento. `/personajes` con la lista (anillo de estado, icono y texto), `/personajes/nuevo` con el alta en pasos (tipo, nombre, fotos, consentimiento, resumen) y `/personajes/[id]` con la ficha: referencias, consentimiento y borrado.
- **Sin consentimiento vigente un personaje no genera nada** (RF10). No es una casilla decorativa: lo decide el servidor antes de encolar, volviendo a deducir el estado de los datos en lugar de creerse la columna `characters.state`, que solo es una caché para listar. Los cuatro estados —borrador, en revisión, listo y bloqueado— se muestran siempre con icono y texto, nunca solo con color.
- **Fricción según quién sea el titular de la imagen** (ADR-0017): «soy yo» y «animal propio» se registran con la declaración del usuario, su cuenta y la fecha; **un tercero exige un documento firmado subido** y el personaje queda en revisión, sin poder generar, hasta que un administrador acepta el documento en `/admin/personajes`. Sin documento el registro se rechaza en lugar de guardarse a medias.
- **Declaración obligatoria de mayoría de edad**: sin ella no hay registro, y sin registro el personaje está bloqueado. Se documenta expresamente como **control, no como garantía** —Escenara no comprueba la edad de nadie— en la interfaz, en la guía de usuario y en `docs/legal/cumplimiento-y-privacidad.md`, que recoge además qué riesgos quedan abiertos.
- **Revocar el consentimiento bloquea el personaje al momento**, sin estado intermedio: no se puede volver a generar con él. Lo ya generado se conserva con aviso, porque borrarlo sin que nadie lo pida destruiría trabajo; quien quiera que desaparezca, borra el personaje. Los registros revocados **no se borran**: son la prueba de qué se declaró y cuándo, y un índice único parcial impide que haya dos sin revocar a la vez.
- **Al generar con un personaje se envían varias referencias suyas**, hasta el tope que declara el modelo en el catálogo (el modelo de imagen predeterminado admite 10), en el orden que fijó el usuario. Una sola foto era el atajo de 0.10.0; varias guían mucho mejor la identidad. En `/crear`, el selector de personaje sustituye a la imagen suelta, que sigue disponible eligiendo «Sin personaje».
- **Revisión de las referencias antes de enviarlas al proveedor** (ADR-0009): la reducción de tamaño ya la hacía la biblioteca al subir (1920 × 1080 y WebP), y ahora hay que confirmar expresamente que en las fotos no aparece ninguna otra persona ni ningún menor. Sin esa confirmación no se encola nada.
- **Borrar un personaje borra sus derivados**: el personaje, su consentimiento, sus relaciones con las fotos y los medios **generados** con él, fila y objeto del almacenamiento, con la lista de claves borradas en el registro. Primero la transacción de las filas y después los objetos, nunca al revés: así el peor caso es un objeto huérfano (que se registra con su clave) y no una fila que apunta a un archivo inexistente. Las fotos de referencia se conservan: son del usuario y pueden estar en otro personaje. El diálogo de borrado **enumera qué se va a borrar** antes de pedir la confirmación, con las cifras que da el servidor.
- **Comprobación de uso en el borrado definitivo de un medio**, aplazada en 0.8.0 por no tener consumidores: los personajes son el primero. Una foto usada como referencia (o el documento de un consentimiento) responde 409 con la lista de personajes afectados y **no se borra**; repitiendo la petición con la confirmación sí se borra, y entonces el personaje puede quedarse por debajo del mínimo y dejar de poder generar.
- **Admin › Ajustes › Personajes**: fotos de referencia mínimas por personaje, con 3 por defecto (ADR-0013: la configuración vive en el panel, no en `.env`). Por debajo del mínimo el personaje no genera aunque tenga el consentimiento registrado.
- **`/admin/personajes`**: consentimientos de terceros pendientes de revisión, con el documento a la vista y el dueño delante. Aceptar deja el personaje listo; rechazar lo bloquea y **exige una nota**, que ve quien lo pidió. Ni el dueño del personaje puede revisarse a sí mismo.
- Componentes nuevos en el catálogo `/admin/componentes`: insignias de estado de personaje, selector de personaje (sin `<select>` nativo) y el formulario de consentimiento en **zona de claridad** —superficies neutras, sin degradados ni parallax, con el texto legal delante—. El anillo de historia gana el estado «bloqueado».
- **La cola revalida el consentimiento antes de enviar.** Entre encolar un trabajo y despacharlo puede pasar un rato largo (y en un reintento, más), así que el worker vuelve a comprobar que el personaje puede generar **antes de subir nada** al proveedor. Un trabajo detenido así se cierra **sin coste**, con el motivo «el consentimiento del personaje ya no permite generar con él», y **no se reintenta**: reintentar esperaría a que alguien devolviera un consentimiento que precisamente se ha retirado. La toma del trabajo se renueva entre subidas, porque diez referencias pueden tardar más que los tres minutos que dura.
- **Un personaje que alguna vez tuvo consentimiento de tercero lo sigue teniendo**: cualquier registro posterior exige de nuevo documento y revisión, y no se puede pasar a «soy yo» ni a «un animal mío». Si se pudiera, un documento rechazado se eludiría registrando «soy yo».
- **El clip que sale de un fotograma con personaje hereda sus reglas**: consentimiento vigente y su propia confirmación de revisión de referencias. Y si la «imagen suelta» de un trabajo es el resultado de otro trabajo hecho con un personaje, el trabajo nuevo **hereda ese personaje**, así que el borrado alcanza toda la cadena.
- **Registro de accesos de administración al consentimiento** (`consent_access_log`): quién, cuándo, qué personaje y qué hizo. Decir «solo lo ve el admin» no vale de nada si no se puede comprobar quién lo vio.
- Tests: sin consentimiento registrado la API rechaza el encolado y no queda ningún trabajo; por debajo del mínimo de referencias tampoco; revocar bloquea las generaciones nuevas al momento y revocar dos veces lo dice en lugar de fingir; un tercero sin documento no se registra y no habilita nada, y con documento queda en revisión hasta que el admin lo acepta; un rechazo sin nota no se acepta; el borrado del personaje deja cero filas y **borra el objeto del derivado en SeaweedFS** conservando las fotos de referencia; un personaje ajeno responde 404 en todas las operaciones y el admin lo lee pero no lo edita ni lo borra; una petición sin `Origin` no cambia nada; no se puede referenciar una foto ajena conociendo su identificador; y un medio en uso avisa con la lista de personajes y no se borra sin confirmación. Más la regla de estado probada como función pura, caso a caso.

- Tests de los arreglos de la revisión de código, uno por hallazgo: revocar después de encolar no llama al proveedor ni sube una sola referencia y libera la reserva; quitar fotos por debajo del mínimo hace lo mismo y no se reintenta; un rechazo no se puede eludir con «soy yo» ni con «un animal mío» ni revocando; borrar con un trabajo enviado responde 409 sin tocar nada y con uno en cola lo cancela devolviendo el presupuesto, sin dejar reservas que el barrido no pueda encontrar; el clip exige la revisión y el consentimiento vigente; el admin no recibe las fotos ni la portada en ninguna respuesta (comprobado sobre el cuerpo HTTP, contando las URL firmadas) y sus accesos quedan registrados; el documento se guarda sin recortar y no se puede colar como referencia ni como imagen suelta; reeditar un resultado hereda el personaje y el borrado alcanza los dos trabajos; la fecha de la revisión se guarda; borrar una foto para siempre deja el personaje en borrador al momento; y un orden parcial de referencias se rechaza.

### Cambiado

- `generation_jobs` guarda el personaje del trabajo (`character_id`), que es lo que permite localizar los derivados al borrarlo; una animación hereda el personaje del fotograma del que sale. La entrada del trabajo ya guardaba la lista de referencias desde 0.10.0 y ahora el worker **sube todas** al proveedor, recortadas al tope del modelo por si el catálogo cambió entre el encolado y el envío.
- El modelo que viaja a «Crear» incluye cuántas fotos de referencia admite (`maximoReferencias`), para poder decir cuántas se van a enviar en lugar de suponerlo.
- La comprobación de si un personaje puede generar lee **el último registro de consentimiento, revocado o no**. Leer «el vigente» a secas confundía un consentimiento revocado con no haber registrado ninguno, y el motivo que se le mostraba al usuario era falso.
- `Paso`, el paso numerado del flujo de creación, pasa de `app/crear/_componentes` al catálogo de componentes: ahora lo usan «Crear» y el alta de personajes.
- **El documento de consentimiento se guarda sin procesar** (`media.is_document`): sin recortar a 1920 × 1080, sin reconvertir a WebP y sin pasar por el editor de imagen, porque lo que hay que poder leer al revisarlo es la letra pequeña de una hoja firmada. No puede usarse como referencia de un personaje ni como imagen suelta en «Crear», y los selectores de fotos piden el listado sin documentos; en la biblioteca sigue apareciendo, porque es un archivo del usuario.
- **No se puede borrar un personaje con trabajos ya enviados al proveedor** (409, diciendo cuántos): su tarea existe, se va a cobrar y su resultado va a llegar. Los que aún no han salido se cancelan liberando su reserva antes de borrar nada. Para dejar de generar con él al momento, revocar el consentimiento es inmediato.
- Los listados de personajes se resuelven con **consultas agregadas** (`distinct on` para el último consentimiento, `count` agrupado y las portadas en una sola consulta) en lugar de cuatro consultas por personaje, y los ajustes se leen una vez por listado.

### Corregido

- **La biblioteca de administración enseñaba los documentos de consentimiento y las fotos de los personajes ajenos.** El aislamiento estaba en `/api/personajes`, pero `/admin/medios` los listaba, los servía y los dejaba editar como cualquier otro archivo. Ahora, para quien no es su dueño, un medio con `is_document` o que sea referencia de un personaje responde 404 en todas las operaciones. El resto de la biblioteca ajena sigue exactamente como en 0.8.0.
- **Cualquier imagen de la biblioteca valía como documento de consentimiento**, incluida una foto del propio personaje: el consentimiento se respaldaba con la misma cara que autoriza. Ahora el documento tiene que haberse subido **como documento** y no puede ser referencia de ningún personaje, y en el formulario solo se puede subir desde el equipo (sin «Elegir de la biblioteca» ni «Desde una URL»).
- **La cola enviaba fotos que ya no eran del personaje o estaban en la papelera.** El despacho cruza ahora las referencias guardadas con las vigentes y descarta lo que esté en la papelera; si quedan por debajo del mínimo, cierra sin subir nada. Y una foto en la papelera **ya no cuenta para el mínimo**, así que el personaje deja de poder generar desde que va a la papelera y no desde que se borra (restaurarla lo devuelve a «listo» sin volver a añadirla).
- **El diálogo de borrado definitivo de un medio se quedaba abierto después de borrar**, regresión de 0.8.0 introducida al añadir el aviso de uso. Ahora se cierra siempre, salvo cuando la respuesta trae la lista de personajes que usan la foto: entonces se queda abierto enumerándolos y el botón pasa a «Borrar de todas formas».
- **Borrar una foto para siempre dejaba el estado del personaje sin recalcular**: su ficha decía «listo» mientras la generación lo rechazaba por falta de referencias.
- Un consentimiento registrado dos veces a la vez (un doble clic) daba un error 500 del servidor en lugar de un 409.
- Reordenar las referencias admitía un orden parcial, y las que faltaran conservaban su posición: dos referencias podían acabar compartiendo sitio y la portada pasaba a depender del desempate de la consulta. Ahora el orden tiene que traer todas las referencias del personaje, una sola vez.
- Los topes de personajes por cuenta y de referencias por personaje se comprueban con la fila del usuario bloqueada: dos peticiones a la vez leían el mismo total y se pasaban las dos.
- El índice parcial de «un consentimiento vigente por personaje» solo existía en el SQL de la migración, así que la siguiente migración generada habría propuesto borrarlo. Ahora está declarado en el esquema, con una migración de puesta al día idempotente.

### Seguridad

- **Quien administra ve el consentimiento y el documento, nunca las fotos de referencia**, y solo de personajes con titular tercero. No es que la interfaz no las muestre: **no salen en la respuesta** de `/admin/personajes` ni de `GET /api/personajes/{id}`, así que no hay forma de mirarlas. Un personaje ajeno sin consentimiento de tercero responde 404 también al admin, y su ficha se muestra en solo lectura, sin acciones que el servidor vaya a rechazar. Cada acceso queda registrado.
- **La confirmación de la revisión de referencias se guarda con su fecha** (`references_reviewed_at`), igual que la de derechos: es una declaración, y una declaración sin fecha no prueba nada.
- **A los documentos de consentimiento se les quitan los metadatos sin recomprimir la imagen.** Una foto hecha con el móvil lleva EXIF con la **localización** de donde se firmó, la marca del teléfono y la fecha exacta. La limpieza va a nivel de contenedor (segmentos `APPn` y comentarios en JPEG; trozos `eXIf`, `tEXt`, `zTXt`, `iTXt` y `tIME` en PNG), así que los píxeles salen **byte a byte idénticos** y no se pierde legibilidad. Por eso un documento solo puede ser **JPEG o PNG**: en WebP y AVIF no hay un recorte de contenedor igual de fiable y recomprimir sería perder justo lo que hay que poder leer.
- **El documento de un consentimiento vigente no se puede borrar para siempre** (409): es la prueba que sostiene al personaje. Primero se revoca el consentimiento y después ya se borra.
- La cola de revisión va **paginada** y deja **un solo apunte de auditoría por carga**; el apunte por personaje queda para cuando se abre su ficha, que es donde el documento se ve de verdad.
- Las fotos de los personajes y los documentos de consentimiento son datos personales sensibles: solo los ve su dueño, y quien administra abre el documento de un tercero **únicamente** para revisarlo, desde `/admin/personajes`. Se sirven con URL temporales firmadas que caducan y no aparecen en ningún registro del servidor.
- Toda la autorización está en el servidor: un personaje ajeno responde 404 en todas las operaciones (no revela que existe), el admin puede leerlo pero no editarlo ni borrarlo, y una foto de otro usuario no se puede referenciar aunque se conozca su identificador. Todas las peticiones que cambian datos exigen `Origin` del mismo sitio.
- La revisión de un consentimiento solo la hace un administrador, y no sobre un consentimiento ya revisado o revocado: la condición va en el propio `UPDATE`, así que dos personas revisando a la vez no pueden apuntar dos resultados distintos.

### Actualizar desde la 0.12.0

- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. Son tres: la primera crea `characters`, `consent_records` y `character_references`, añade `character_id` a `generation_jobs` y el índice único parcial que garantiza un solo consentimiento sin revocar por personaje; la segunda añade `consent_access_log`, el motivo de fallo `consentimiento`, `generation_jobs.references_reviewed_at` y `media.is_document`; y la tercera solo pone al día la declaración del índice parcial de consentimientos (es idempotente y no hace nada si ya existe). Ninguna toca datos existentes.
- **Si administras la instalación, cambia lo que ves en `/admin/medios`**: los documentos de consentimiento y las fotos que sean referencia de un personaje ajeno dejan de aparecer y de poder abrirse. Todo lo demás de la biblioteca de otros sigue igual. Los documentos de terceros se revisan en `/admin/personajes`, y cada vez que abres la ficha de uno queda registrado.
- **Revisa Admin › Ajustes › Personajes**: el mínimo de fotos de referencia llega con 3. Con un mínimo alto, los personajes que no lleguen a él no podrán generar hasta que se les añadan más fotos.
- **Si administras la instalación, mira `/admin/personajes` de vez en cuando**: un personaje con consentimiento de tercero se queda en revisión —y sin poder generar— hasta que alguien acepte su documento. En una instalación desatendida eso es un bloqueo permanente, y es a propósito.
- Los trabajos de 0.12.0 y anteriores se quedan sin personaje (`character_id` nulo). Siguen funcionando igual: la imagen suelta de 0.10.0 sigue disponible en «Crear».

## [0.12.0] · 2026-09-27

### Añadido

- **Cola persistente de trabajos sobre PostgreSQL** (ADR-0003): las generaciones dejan de enviarse dentro de la petición del navegador. Pedir un trabajo lo **encola**; enviarlo al proveedor lo hace un **worker**, que es un proceso aparte (`bun run worker`, o junto a la web con `bun run dev`). Cerrar el navegador ya no detiene nada y al volver el estado es el real.
- La toma de trabajos es un solo `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`: **dos workers nunca se llevan el mismo trabajo**. El envío va partido en dos: preparar (no cuesta nada, se puede reintentar) y llamar al proveedor, que se marca en la fila **antes** de llamar y solo si la fila sigue siendo de ese worker.
- **Ningún trabajo que haya tocado al proveedor vuelve a la cola.** Si la toma caduca, lo que decide es el estado: sin haber llamado, el trabajo se cierra sin coste y suelta su reserva; con la llamada en curso, queda «sin respuesta» con la reserva retenida; y si ya tenía tarea, pasa a «enviado» y desde ahí **solo se consulta**.
- **Solo se da por «no cobrado» lo que el proveedor ha rechazado con una respuesta que lo prueba** (clave inválida, cuenta sin saldo, exceso de ritmo). Un 5xx, un 200 sin identificador de tarea, una red caída o un tiempo agotado dejan el trabajo pendiente de revisión con su reserva retenida: pueden venir de un trabajo ya aceptado, y decidir «no cobrado» por descarte es lo que provoca los dobles cobros.
- **El cambio de estado a terminal y el apunte del gasto van en la misma transacción** al cancelar, al cerrar un envío fallido y al recuperar un trabajo abandonado. Además, cada pasada del worker **barre las reservas huérfanas**: un trabajo cerrado cuya reserva no se llegó a liberar se cierra solo, porque una reserva olvidada le come presupuesto a alguien para siempre y nadie lo notaría.
- **Las páginas no cambian el estado de un trabajo ni mueven dinero.** Abrir el historial o consultar un trabajo solo lee. Y un fallo de la consulta —un 5xx, un tiempo agotado, la red caída— **no cambia el estado**: lo que ha fallado es la pregunta, no la tarea, que sigue donde estaba; del intento solo queda la marca que espacia las consultas. El **único** camino automático a «sin respuesta» por falta de respuesta es el techo de media hora, medido desde que el trabajo salió al proveedor. Antes, un corte de red de unos segundos mandaba a revisión (reteniendo su reserva) un trabajo que estaba generando bien.
- **Una fila que ya ha llamado al proveedor no puede quedar atrapada.** Mientras está en «enviando» conserva su toma a propósito: soltársela la dejaría fuera del alcance de la recuperación, en un estado del que nadie la sacaría, con su reserva apartada y sin que nadie mirase esa tarea ya pagada. La recuperación recoge esas filas aunque hayan perdido la toma y las deja pendientes de revisión.
- **Tras obtener el identificador de la tarea solo se reintenta la escritura, nunca la llamada.** Si la base de datos falla al guardarlo, se insiste; si aun así no se consigue, el identificador queda en el registro del servidor (sin ninguna clave) y el trabajo pasa a revisión con su reserva retenida.
- **Reintentos solo para fallos anteriores a la llamada.** Un tiempo agotado no se reintenta nunca, y un rechazo por ritmo del proveedor cierra el trabajo sin coste en lugar de reencolarlo: no existe ninguna ruta de reenvío automático que haya pasado por el proveedor.
- **Registro de gasto (`usage_ledger`) y presupuesto** (ADR-0016): reservas, liberaciones, consumos y ajustes manuales. La **reserva del coste máximo estimado va en la misma transacción que el encolado**, con la fila del usuario bloqueada, así que dos trabajos simultáneos no reservan el mismo saldo. El consumo y la liberación son idempotentes por trabajo: un sondeo y un callback que lleguen los dos no cobran dos veces.
- **«Depósito de presupuesto»** en zona de claridad, en «Crear» y en el historial: autorizado, reservado ahora, consumido y disponible, con el equivalente aproximado en euros y la palabra «estimación» donde corresponde. Se dice expresamente que es un tope por cuenta que fija quien administra y que no es dinero de Escenara: cada trabajo se paga con los créditos de la cuenta del propio usuario.
- **El presupuesto retenido se explica.** El depósito distingue lo reservado en trabajos en marcha de lo **retenido** en trabajos pendientes de revisión, que no se libera solo, y cuando no queda presupuesto el mensaje lo dice con las cifras delante en lugar de invitar a esperar algo que no va a pasar. La cabecera del panel lleva un contador de trabajos pendientes de revisión, porque cada uno retiene presupuesto de alguien.
- **Puesto real en la cola** y **estado del worker**: si no hay ningún proceso atendiendo la cola se dice, en lugar de dejar un «en cola» eterno.
- **Cancelar un trabajo que todavía no ha salido** hacia el proveedor (en cola o esperando límite), lo que suelta su reserva. Uno ya enviado no se puede cancelar: eso llega en 0.19.0 y solo si el proveedor lo admite.
- **Si el coste no se puede acotar, el trabajo no se envía** (PRD §6): queda esperando un límite de gasto y no reserva nada. La regla es determinista y sale del catálogo: un clip cuyo modelo no declara duración no tiene coste acotable. Lo que el usuario autoriza es exactamente lo que se reserva, y se guarda aparte de la estimación original.
- **Aviso de cobro por encima de lo autorizado o apartado.** El precio final lo decide el proveedor: si cobra más que el techo (el límite que fijó el usuario, lo que se reservó o el tope por trabajo, el más exigente de los tres), se apunta el **gasto real** y se registra el exceso, visible en el trabajo para quien lo pidió y en una lista propia de `/admin/trabajos`. También se avisa cuando nadie fijó un límite pero el proveedor se ha pasado de la estimación con la que se reservó. Un exceso repetido significa que el precio del catálogo está desfasado.
- **`/admin/trabajos`**: trabajos sin respuesta del proveedor con su reserva retenida a propósito, cobros por encima del límite autorizado, y el estado de los workers de la cola. Quien administra cierra un trabajo con los créditos que haya comprobado en el proveedor, y el motivo queda escrito en el registro de gasto; una segunda corrección apunta **la diferencia**, así que corrige de verdad. Nada se reenvía desde ahí.
- **Callbacks del proveedor de verdad.** Cuando la instalación tiene URL pública y secreto configurados en Admin › Ajustes, al crear la tarea se le pasa a KIE el parámetro `callBackUrl`. Esa URL lleva el identificador del trabajo y **un token aleatorio propio de ese trabajo**; en la base de datos solo se guarda su huella con el secreto, así que el token no queda escrito en ningún sitio. La ruta valida el token en **tiempo constante**, corta antes de leer ajustes o abrir la bóveda si falta, y **del cuerpo no usa nada**: dispara una sola consulta al proveedor por el identificador de tarea guardado. Sin URL pública no se envía `callBackUrl` y la ruta responde 404. El sondeo del worker funciona siempre, con callbacks o sin ellos.
- **Admin › Ajustes › Presupuesto y cola**: presupuesto por usuario, tope por trabajo, trabajos simultáneos por usuario, URL pública de la instalación y secreto de los callbacks (cifrado en la bóveda).
- **Contrato interno de decisiones** (`server/decisiones/`), preparación para 0.24.0: `decidir(entrada) → { estado, evidencia, coste }` con una implementación de reglas deterministas que se ejecuta antes de encolar. **No hay ningún servicio externo todavía** y las reglas no cuestan nada.
- Un test comprueba que **ningún precio del catálogo sembrado pasa del tope por trabajo** que trae la instalación (el más caro son 72 créditos frente a un tope de 500): si lo pasara, nadie podría generar con ese modelo nada más instalar Escenara.
- Tests: dos trabajos a la vez no reservan el mismo saldo; un tiempo agotado no provoca un segundo cobro y la conciliación por `task_id` cierra el trabajo con los créditos informados; **un fallo de la base de datos justo después de crear la tarea no provoca ningún reenvío** (con la escritura rota de verdad por un disparador de PostgreSQL); dos workers no toman el mismo trabajo y el que pierde la toma no llega a llamar al proveedor; una toma que caduca con la llamada en curso deja el trabajo en revisión y nunca en la cola; **un trabajo que esperó 40 minutos en la cola pero acaba de salir no se cierra por edad**; un callback repetido no crea dos medios ni dos apuntes de consumo, y un token que no cuadra responde igual que un trabajo inexistente; un coste que no se puede acotar no se envía; un cobro por encima del límite apunta el gasto real y registra el exceso; una segunda corrección manual corrige de verdad; y los ajustes se guardan como `jsonb` de verdad. Además: un 5xx, un 504, un 200 sin identificador de tarea, un tiempo agotado y la red caída dejan el trabajo en revisión con la reserva retenida y cero reenvíos, mientras que una clave rechazada, una cuenta sin saldo y un exceso de ritmo sí lo cierran sin coste; un trabajo con toma viva sigue preparándose aunque se consulte desde el historial; una preparación abandonada se cierra sin coste y no queda en revisión; el barrido recupera la reserva de un trabajo cerrado al que le faltó el apunte y no toca los que están en revisión; y el 402 dice que hay créditos retenidos y quién los resuelve. Y en la tercera ronda: un 5xx, un tiempo agotado y la red caída **al consultar** dejan el trabajo como estaba y la consulta siguiente lo cierra con normalidad; el techo de edad sigue siendo el único camino automático a revisión; soltar la toma de una fila «enviando» no la atrapa; una liberación sin trabajo asociado no deja ciego al barrido de reservas; el aviso de exceso se apunta una sola vez aunque el gasto se cierre dos veces; y un identificador de trabajo que no es un UUID se rechaza sin consultar nada.

### Cambiado

- **El seguimiento de fondo de 0.10.0 desaparece** y lo absorbe el worker: ahora solo el worker consulta al proveedor en automático, así que no hay dos mecanismos preguntando por lo mismo. Abrir el historial ya no dispara consultas al proveedor: la página solo lee el estado guardado.
- `bun run dev` arranca la web (3021) **y el worker**. Los dos procesos van atados: si uno muere se para el otro, y Ctrl-C los para a los dos, así que el worker se da de baja y no deja trabajos tomados. Para arrancar solo la web: `bun run dev:web`.
- `trabajos_generacion` pasa a ser un `GenerationJob` completo: prioridad, intentos e intentos máximos, disponibilidad (espera entre reintentos), toma del worker con caducidad, motivo de fallo normalizado, reserva asociada y límite de créditos autorizado por el usuario. Estados nuevos: «en cola», «esperando tu límite de gasto» y «cancelado».
- El tope de trabajos simultáneos por usuario se configura en Admin › Ajustes (antes era una constante de tres en el código).

### Corregido

- **Los valores de `jsonb` se guardaban doblemente codificados** (una cadena con JSON dentro, `jsonb_typeof = 'string'`) en `settings` y en la entrada de los trabajos, herencia de la 0.8.0. La causa está en el cliente: el `jsonb` de Drizzle está pensado para `node-postgres` y le pasa el valor ya convertido a texto, y `Bun.SQL` lo vuelve a codificar. Ahora el texto JSON viaja como parámetro de texto con un `cast` explícito (`server/db/jsonb.ts`) y la migración desenvuelve lo que ya estaba guardado. Se leía bien de casualidad; lo que no funcionaba era consultar dentro del valor con los operadores de `jsonb`, que es justo lo que necesitan los presupuestos.

### Seguridad

- El endpoint de callback no lleva sesión, así que lo que lo autentica es el token de ese trabajo, comparado en tiempo constante contra la huella guardada. Sin token no se lee ningún ajuste ni se abre la bóveda, y sin URL pública o sin secreto no se atiende ningún callback. Un token que no cuadra responde exactamente igual que un trabajo inexistente. El límite de ritmo por trabajo se cuenta **después** de validar el token, para que nadie pueda gastar el cupo de un trabajo ajeno adivinando su identificador.
- **El token del callback viaja en la cadena de consulta de la URL**, así que queda en los registros de acceso de los proxies que haya delante y en los del proveedor. Solo sirve para pedir la conciliación de ese trabajo y no permite inventar un resultado ni un gasto, pero al publicar conviene no registrar la cadena de consulta de `/api/generacion/callback/*`; está explicado en la guía y en ADR-0003.
- La resolución manual de un trabajo va en una transacción con su fila bloqueada y exige que esté de verdad pendiente de revisión: dos personas resolviéndolo a la vez no pueden apuntar dos correcciones distintas.
- Cancelar, autorizar un límite y consultar siguen filtrando por usuario: un trabajo ajeno responde 404. Las rutas que cambian datos exigen `Origin` del mismo sitio, y las acciones de `/admin/trabajos` vuelven a comprobar el rol contra la base de datos.
- Un trabajo sin respuesta del proveedor **mantiene su reserva retenida** hasta que alguien lo resuelve: soltar lo que quizá se ha pagado sería mentir sobre el gasto.

### Actualizar desde la 0.11.0

- **Hace falta PostgreSQL 16 o superior** (la migración usa el predicado `IS JSON`). El `docker-compose.yml` del proyecto trae PostgreSQL 18, así que en local no hay nada que hacer.
- **Aplica las migraciones antes de arrancar el código nuevo**: `bun run db:backup` y luego `bun run db:migrate`. El código de 0.12.0 espera las columnas de cola, los estados nuevos y los valores de `jsonb` ya desenvueltos; arrancarlo contra una base de datos sin migrar fallaría al leer los ajustes. Las migraciones añaden las columnas de cola a `generation_jobs`, crean `usage_ledger` y `queue_workers`, añaden el estado `enviando` y las columnas de callback y exceso, y **desenvuelven los valores de `jsonb` que estaban doblemente codificados** en `settings` y en la entrada de los trabajos. El desenvuelto lleva su propia marca en `settings`, así que es idempotente por construcción: aunque ese bloque se ejecutara otra vez, no volvería a tocar nada.
- **Hay un proceso nuevo que arrancar.** En local, `bun run dev` ya levanta la web y el worker; si arrancas la web por tu cuenta (`bun run dev:web`), arranca también `bun run worker` o los trabajos se quedarán en cola. En el servidor, el worker es un servicio propio con el mismo `.env` que la web. Sin worker no se pierde nada: los trabajos esperan y la interfaz avisa de que nadie está atendiendo la cola.
- Revisa **Admin › Ajustes › Presupuesto y cola**: el presupuesto por usuario llega con 2.000 créditos, el tope por trabajo con 500 y los trabajos simultáneos con 3 (lo mismo que había en el código). Con el presupuesto a 0 no hay tope propio y manda solo el saldo del proveedor. **Ningún modelo del catálogo sembrado pasa de ese tope por trabajo**: el más caro es `kling/v3-turbo-image-to-video` con 72 créditos, y hay un test que lo comprueba. Si subes el precio de un modelo por encima del tope, los trabajos de ese modelo se rechazarán con un aviso de presupuesto.
- Los callbacks vienen apagados. Para activarlos basta con poner la URL pública y guardar el secreto en Admin › Ajustes: **la dirección se la pasa Escenara al proveedor en cada trabajo**, con el token de ese trabajo dentro, así que no hay nada que configurar en el panel de KIE.

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
