# ADR-0035 · El montaje es una línea de tiempo simple y el render un trabajo de FFmpeg en el worker

- **Estado**: aceptada (el alcance del editor, el render local y la etiqueta obligatoria son firmes; la mezcla de
  la música, el consejo de duración, la cancelación y la repetición de una escena son provisionales)
- **Fecha**: 2026-09-29
- **Versión**: 0.32.0
- **Relacionadas**: ADR-0003 (la cola vive en PostgreSQL), ADR-0013 (la configuración se edita en el panel),
  ADR-0014 (seguimiento de trabajos por sondeo), ADR-0021 (el proyecto como unidad de trabajo), ADR-0023 (motor de
  reglas de controles previos), ADR-0024 (cancelación y reintentos de la producción)

## Contexto

Hasta la 0.31.x el recorrido de Escenara acababa con los clips sueltos en la biblioteca. Publicar exigía bajarlos,
abrir un editor de vídeo aparte, ordenarlos, pegar los subtítulos a mano y volver a exportar. Ahí se perdía todo lo
que el producto sabe del proyecto: el orden de las escenas, los subtítulos ya editados (0.21.0), la música
autorizada, y si la revisión de continuidad tenía un fallo crítico abierto (0.20.0).

Cuatro restricciones marcan la decisión:

1. **Un editor de vídeo es un producto entero.** Transiciones, efectos, curvas de audio y multipista no caben en
   una versión, y si el modelo de datos los admite «para después», la pantalla los pide enseguida.
2. **El resultado no puede costar un crédito.** Montar es la última milla de algo que ya se pagó clip a clip;
   cobrar otra vez por concatenar sería cobrar por nada.
3. **La etiqueta de contenido sintético no es una preferencia.** Es obligatoria en toda exportación, también con
   personajes completamente animados, y una regla que la pantalla puede desactivar no es efectiva. Su alcance es
   deliberadamente más amplio que el supuesto jurídico de *deepfake* del artículo 50 del Reglamento de IA.
4. **El render es la operación más pesada de la instalación.** Descarga ficheros, re-codifica vídeo y puede tardar
   minutos: no puede vivir en una petición HTTP ni tumbar la máquina de quien se autoaloja.

## Opciones

### A. Render en el navegador (WebCodecs o `ffmpeg.wasm`)

El montaje se compone en la pestaña de quien lo edita y el MP4 se sube ya hecho.

- **Supuesto**: el material ya está en el navegador y así la instalación no gasta CPU.
- **Dónde falla primero**: los clips **no** están en el navegador, hay que bajarlos enteros (cientos de MiB) por
  una conexión doméstica, y el render se pierde al cerrar la pestaña. Peor: el MP4 llegaría al servidor como un
  fichero cualquiera, así que la **etiqueta obligatoria** pasaría a ser una promesa del cliente. Un cliente no
  puede ser el guardián de un requisito legal.

### B. Remotion (React para vídeo)

La línea de tiempo se declara en componentes y Remotion renderiza con Chromium sin cabeza.

- **Supuesto**: describir el vídeo como una interfaz ahorra escribir filtros de FFmpeg.
- **Dónde falla primero**: la **licencia**. Remotion exige licencia de empresa por encima de un umbral de personas,
  y Escenara es AGPL-3.0 y se autoaloja: cada instalación heredaría una obligación que no puede evaluar (brainstorm
  §3.7). Además arrastra un Chromium por render para un trabajo que aquí es concatenar, escalar y mezclar audio.

### C. Línea de tiempo simple y render con FFmpeg en el worker, con cola propia

`montages` (uno por proyecto, editable, con versión) y `montage_exports` (histórico de lo que se montó). El worker
iguala cada fragmento, concatena, mezcla y escribe el MP4 de 1080 × 1920.

- **Supuesto**: lo que hace falta para publicar un reel es orden, recorte, volúmenes y subtítulos; lo demás es otro
  producto.
- **Dónde falla primero**: cualquier cosa que no sea un corte seco —una transición, un fundido de música— exige
  volver a tocar el generador de filtros, y quien espere un editor de verdad se queda corto.

## Decisión

**Opción C.** Línea de tiempo simple, render local con FFmpeg en el worker, y ninguna llamada a ningún proveedor.

Lo que la sostiene, punto por punto:

- **El editor guarda cuatro cosas y solo cuatro**: el orden de los fragmentos, el recorte de entrada y de salida,
  los volúmenes de voz y música, y las opciones de subtítulos y etiqueta. Transiciones, efectos, 16:9 y 1:1 quedan
  para la 0.36.0; `montages.format` admite hoy un único valor (`vertical_9_16`) precisamente para no fingir que
  hay más.
- **El guardado es explícito y con versionado optimista.** `montages.version` sube en cada guardado y el `PUT`
  exige la versión que se leyó: si otra pestaña se adelantó, se responde 409, se dice qué ha pasado y **lo editado
  se queda en la pantalla**. No se guarda en cada arrastre porque un montaje se tantea, y cada tanteo sería una
  versión nueva —y con ella una exportación nueva.
- **El render va en el worker con su propia cola**, `montage_exports`, y no en `generation_jobs`. Los trabajos de
  generación existen para **sondear a un proveedor y conciliar gasto**: tienen coste reservado, moneda, reintentos
  autorizados por quien paga y cancelación con «se cobrará». Un render local no tiene coste, no tiene proveedor que
  sondear y no puede cobrarse; meterlo ahí habría obligado a que la mitad de cada columna fuera nula y a que el
  panel de gasto tuviera que aprender a ignorar una clase de trabajo. Lo que sí comparte es la forma: toma con
  caducidad (`lockedBy`, `lockedUntil`), tres intentos y progreso por etapas.
- **El progreso es real.** Se lee de `-progress` de FFmpeg y se apunta por etapas (preparando, normalizando,
  montando, guardando) cada segundo y medio. Una barra inventada en una operación de minutos es peor que ninguna.
- **La exportación es idempotente por montaje y versión.** Un índice único **parcial** sobre
  (`montage_id`, `montage_version`) `where state <> 'fallido'` garantiza una sola exportación viva por versión:
  pulsar dos veces devuelve la misma (200 en vez de 202) y no hay dos MP4 comiéndose la cuota. Es parcial porque
  una exportación **fallida** tiene que poder repetirse sin borrar el rastro de que falló.
- **La etiqueta obligatoria la decide el servidor.** Toda exportación la lleva: persona real, personaje inventado,
  animación o proyecto sin protagonista. El `PUT` rechaza apagarla y la pantalla muestra **el motivo que escribe
  el servidor**, no una frase parecida. Y si la máquina no puede dibujarla (sin `drawtext`
  o sin fuente), **no se exporta**: es más honesto no entregar el vídeo que entregarlo sin la etiqueta exigida por
  el producto. El texto es una constante, `Contenido generado con IA`, y solo se elige dónde va. La nota legal
  distingue esta regla visible de las obligaciones de marcado legible por máquina y divulgación del artículo 50.
- **Los subtítulos se guardan con la exportación**, en SRT y en WebVTT, con los tiempos ya corridos por los
  recortes. No se recomponen al descargar: el fichero que se baja es el que se montó, aunque el guion se haya
  editado después.
- **Los volúmenes van de 0 a 200 %** y la mezcla usa `amix` con `normalize=0`. Con la normalización de serie, cada
  pista que se añade baja el volumen de las demás: poner música apagaría la voz a la mitad sin que nadie lo
  hubiera pedido.
- **En la línea de órdenes de FFmpeg no entra texto de nadie.** Se invoca con `spawn` y **array de argumentos**,
  nunca con un intérprete de órdenes; las rutas se validan contra `[A-Za-z0-9_./-]`; los números se rechazan si son
  `NaN`, infinitos o en notación científica; el único texto que se dibuja es la constante de la etiqueta; y los
  subtítulos —que sí son del usuario— viajan **en un fichero**, de modo que en el argumento va la ruta y no el
  contenido.
- **Los topes son parte de la decisión, no un detalle**: 300 s por montaje, 60 fragmentos, 0,2 s de recorte
  mínimo, 15 minutos de render (3 por clip igualado), 128 MiB por archivo de entrada y 1 GiB descargado por
  exportación, con el resultado contra la cuota de la biblioteca. Sin ellos, un montaje mal hecho es una forma de
  agotar el disco y la CPU de una instalación autoalojada.
- **La comprobación previa es la de 0.18.0.** Un fallo crítico abierto de la revisión, una escena sin clip, un
  montaje vacío o la cuota llena frenan la exportación **antes** de bajar el primer byte, y el mensaje dice cuál de
  las cuatro cosas pasa y en qué escena.
- **C2PA se aplaza a la 0.41.0.** Aquí hay etiqueta visible y metadatos básicos; firmar la procedencia exige
  certificados, custodia de claves y una cadena que decidir, y es trabajo de la versión legal.

## Decisiones provisionales del propietario

Van marcadas aparte porque son de producto y se cerraron por defecto razonable, no por evidencia:

1. **La música se mezcla entera y a la vez.** Todas las pistas autorizadas del proyecto entran desde el segundo 0,
   sin bucle si son más cortas que el montaje y **sin fundido** al final: el corte lo da la duración total. Lo
   razonable para un reel con una pista; con varias, suenan simultáneas.
2. **El consejo de duración está en 60 s.** Por encima, la pantalla avisa de que un reel se ve hasta el final mucho
   más a menudo por debajo de ese número. Es un aviso, no un freno: el tope duro son 300 s.
3. **No hay cancelación de exportación desde la pantalla.** Un render local no cuesta nada y el tope de 15 minutos
   lo cierra solo; añadir un botón de cancelar habría traído la misma máquina de estados que la producción de pago
   sin la razón que la justifica (allí se cancela porque se cobra).
4. **Una escena no se puede poner dos veces.** La pantalla solo ofrece añadir escenas que **no** están en la línea
   de tiempo, así que no se puede repetir un plano con dos recortes distintos. El servidor no lo prohíbe —montaría
   bien—, de modo que abrirlo es quitar una restricción de la interfaz, no cambiar el modelo.

## Consecuencias

**Lo que se gana.** El recorrido se cierra dentro de Escenara: de la idea al MP4 vertical listo para publicar, con
los subtítulos que ya se editaron y la etiqueta que hay que llevar. El montaje no gasta créditos y no depende de
ningún proveedor, así que una instalación sin claves sigue pudiendo montar lo que ya generó. Y publicar el vídeo de
antes del último cambio no pasa por descuido: cada exportación dice si sigue correspondiendo al montaje de ahora.

**Lo que se pierde.** No hay transiciones, ni fundidos, ni curvas de audio, ni más formato que el vertical. La
instalación necesita FFmpeg con soporte de texto, lo que sube el requisito de quien se autoaloja. Y el render
consume CPU de la misma máquina que sirve la aplicación: con varias exportaciones seguidas se nota, porque el
worker monta **una por pasada** a propósito.

**Qué habrá que revisar.**

- **Los cuatro provisionales de arriba**, empezando por la música: si con dos pistas la mezcla molesta, lo
  siguiente es elegir una pista por montaje, no inventar una automatización de volúmenes.
- **Los topes**, que hoy son constantes del código. Si alguien monta piezas más largas habrá que decidir si pasan
  a Admin › Ajustes o si se quedan como límite de la versión.
- **Los formatos 16:9 y 1:1** (0.36.0): `montages.format` ya es un enum, pero cada formato nuevo trae su
  resolución, sus zonas seguras y su posición de etiqueta.
- **C2PA y los metadatos de procedencia** en la 0.41.0, junto con la revisión legal de la etiqueta.
- **Si el render debe salir de la máquina de la aplicación** cuando haya varias personas montando a la vez: la
  cola propia ya permite un worker aparte, pero no está probado con concurrencia real.
