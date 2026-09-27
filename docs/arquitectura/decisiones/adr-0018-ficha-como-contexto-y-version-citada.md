# ADR-0018 · La ficha del personaje es contexto de generación y cada trabajo cita su versión

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.15.0

## Contexto

Hasta la 0.14.0, generar con un personaje enviaba **solo fotos**: varias referencias suyas, hasta el tope del modelo, con el prompt que escribía la persona. La ficha del personaje era archivo: se guardaba, se leía y no influía en nada.

Eso deja dos problemas abiertos:

- **la identidad se pierde en lo que las fotos no dicen**. Las referencias fijan la cara, pero no la edad aparente, el vestuario habitual, la estética con la que se retrata al personaje ni su actitud delante de la cámara. Cada escena lo reinventa, y la continuidad (0.20.0) no tiene nada a lo que agarrarse;
- **el prompt no es auditable**. Si mañana la ficha influye en el prompt y la ficha cambia, un trabajo de la semana pasada ya no se puede explicar: no hay forma de saber qué apariencia se le pidió al proveedor.

El propietario pide (2026-09-27) que **la ficha sea contexto de generación, no solo archivo**, con las mejores referencias hasta el máximo del modelo elegidas por cobertura de vistas, y que el usuario **vea el contexto aplicado antes de confirmar**.

Las restricciones de partida son las mismas que sostienen la 0.10.0–0.14.0 y no se negocian: nada se envía sin una confirmación explícita del coste mostrado, la misma confirmación no se cobra dos veces (clave de idempotencia con firma en el cliente), ninguna ruta de lectura mueve dinero, y el texto de una persona **no puede** cambiar los parámetros de lo que se le pide al proveedor.

## Opciones

1. **Componer el prompt en el navegador** y enviarlo ya montado. Supone que el cliente es de fiar. Falla en el primer sitio que importa: quien controla el navegador controla entonces el prompt completo, y el bloque de contexto se convierte en un hueco por el que colar cualquier instrucción junto a las fotos de una persona. Además el servidor no podría reconstruir qué se envió.
2. **Componer en el servidor al enviar** (en el worker, leyendo la ficha vigente). Supone que la ficha no cambia entre encolar y enviar. Falla exactamente cuando cambia: el trabajo saldría con una apariencia que el usuario no confirmó, y la pantalla de confirmación habría mostrado otra cosa. Y un reintento podría enviar un prompt distinto del primer intento.
3. **Componer en el servidor al encolar, citando una versión inmutable de la ficha.** Supone que hay versiones y que se conservan. Falla si las versiones se pudieran borrar: un trabajo quedaría citando algo que no existe. Se resuelve no borrándolas nunca (solo con el personaje).

## Decisión

Se elige la **opción 3**, con estas reglas:

- **La descripción es parte de la ficha** (decisión del propietario, 2026-09-27): entra en el bloque de contexto, en su primera línea, y pasa por la **misma** limpieza y el mismo tope de 300 caracteres que los demás campos. Su columna admite 1000, pero lo que va a un prompt se trata igual venga de donde venga.
- **La ficha se versiona** (`character_versions`): número correlativo por personaje, instantánea completa de la ficha y la descripción, referencias incluidas, hoja de personaje, quién y cuándo, motivo del cambio y qué campos cambiaron. Versionan los cambios de **apariencia o de prompt**; los metadatos (nombre, notas de especie) no. Guardar el mismo texto otra vez no crea versión.
- **El prompt lo compone el servidor al encolar** y se guarda **ya compuesto** en `generation_jobs.prompt`, que es exactamente lo que se envía. La escena original se conserva aparte en `input.escena` y el bloque añadido en `input.contextoPersonaje`, para que el historial pueda mostrar las dos cosas sin adivinar dónde acaba una.
- **Cada trabajo cita su versión** (`generation_jobs.character_version_id`). Un trabajo hecho con la versión 2 sigue apuntando a la 2 después de crear la 3, y su prompt sigue llevando el contexto de la 2. **El clip hereda la versión de su fotograma**, no la vigente: animar tiene que seguir siendo el mismo personaje que se generó.
- **Las versiones no se borran nunca.** Son la trazabilidad de lo ya generado. Desaparecen solo al borrar el personaje, que se lleva también sus aprobaciones y sus hojas de personaje.
- **El texto de la ficha se limpia antes de entrar en un prompt**, con la misma función en el servidor y en el navegador: longitud acotada por campo y para el bloque entero, sin saltos de línea, sin caracteres de estructura, y **sin parámetros del proveedor ni instrucciones de redirección** (`aspect_ratio: 21:9`, `--seed=42`, «ignora las instrucciones anteriores», «system prompt»). Los rótulos de cada línea del bloque son fijos y los escribe el servidor.
- **Las referencias se eligen por cobertura de vistas** (0.14.0) y no por orden de llegada: primero una foto original de cada vista mínima, después las demás originales y al final las vistas generadas, recortando al tope que declare el modelo en el catálogo (ADR-0015). Con diez huecos y quince fotos, esto envía una de cada ángulo en lugar de diez del mismo.
- **Las referencias que se envían salen de la instantánea de la versión**, cruzada con las que siguen siendo utilizables: la instantánea es lo que se citó (así el texto y las fotos hablan de la misma versión) y el cruce es lo que evita enviar una foto que se quitó o que está en la papelera.
- **La confirmación cita la versión y el servidor la comprueba.** El navegador manda la versión que tenía delante; si la que se usaría es otra, se responde **409** antes de reservar presupuesto o tocar al proveedor. No basta con que la versión entre en la firma de idempotencia: la firma evita cobrar dos veces lo mismo, no evita gastar en una apariencia que el usuario no ha revisado.
- **La hoja de personaje es material reservado.** No participa en el prompt, pero es un montaje con las fotos de una persona, así que se oculta a quien administra igual que esas fotos, por dos caminos independientes: la marca `media.character_sheet_of` y la referencia desde `character_versions.sheet_media_id`.
- **Las lecturas no escriben.** Ni el historial ni el contexto crean la versión que les falte: la crean el alta del personaje y el relleno de la migración. Un GET que escribe es un GET que se puede provocar desde fuera.
- **El usuario ve el contexto aplicado antes de confirmar.** La pantalla de «Crear» lo pide a una ruta de **lectura** (`GET /api/personajes/[id]/contexto`) que usa la misma función que el encolado: no encola nada, no reserva presupuesto y no toca a ningún proveedor. Lo que se muestra es lo que se enviará.
- **La versión entra en la firma de la confirmación.** La clave de idempotencia del navegador se renueva cuando cambia lo confirmado, y la versión de la ficha forma parte de lo confirmado: si la ficha cambia entre la pantalla y el botón, no se reutiliza la clave de la confirmación anterior.
- **La hoja de personaje se compone en el servidor sin IA** y no participa en el prompt: es una ayuda visual para el usuario, no una referencia que se envíe. Por eso no cuesta créditos y rehacerla es gratis.

## Consecuencias

**Se gana:**

- identidad más estable entre escenas sin gastar ni un crédito más: el contexto es texto;
- prompts auditables: de cualquier trabajo se puede decir qué apariencia se pidió y con qué versión;
- base real para las aprobaciones de 0.17.0 y la revisión de continuidad de 0.20.0: lo que se aprobó tiene un número, y cambiar la apariencia lo invalida con fecha y motivo;
- una sola función compone el contexto, así que la pantalla de confirmación y el envío no pueden decir cosas distintas.

**Se pierde:**

- el prompt guardado ya no es literalmente lo que escribió la persona. Se mitiga guardando la escena aparte;
- el bloque de contexto ocupa prompt: está acotado a 900 caracteres y 300 por campo, porque más contexto acaba tapando la escena;
- una ficha larga y mal escrita puede empeorar el resultado. Es texto del usuario y se ve antes de confirmar, así que es corregible.

**Habrá que revisar:**

- cuando existan varios proveedores con límites de prompt distintos (ADR-0015), el tope del bloque puede tener que salir del catálogo del modelo en lugar de ser una constante;
- la lista de parámetros prohibidos en la limpieza crece con cada proveedor nuevo: es una lista de denegación y por definición va por detrás. Cubre las asignaciones (`aspect_ratio: 21:9`), las banderas (`--seed=42`, también con guion tipográfico), los nombres escritos en texto libre («en resolución 4k») y las medidas sueltas (`1080p`), y descarta una frase de redirección **entera con su cola**; aun así, lo que sostiene la garantía es que el prompt lo **compone** el servidor con rótulos fijos, no que la lista sea completa;
- si en 0.20.0 la revisión de continuidad necesita comparar contra la hoja de personaje, habrá que decidir si esa hoja se envía al proveedor, que hoy no se envía.
