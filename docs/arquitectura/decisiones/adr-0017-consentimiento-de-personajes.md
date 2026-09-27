# ADR-0017 · Consentimiento de personajes: registro con prueba, revisión humana y borrado de derivados

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.13.0

## Contexto

Un personaje guarda las fotos de referencia de una persona o un animal y se usa para generar vídeo con esa cara (RF02). El PRD exige consentimiento y prohibición de suplantación no consentida (RF10), y el marco legal de `docs/legal/cumplimiento-y-privacidad.md` añade dos obligaciones concretas: consentimiento explícito para fotos de rostro (RGPD, LO 1/1982) con derecho de revocación, y prohibición de menores como avatar.

Las restricciones de partida son incómodas y conviene escribirlas antes de decidir:

- **no se puede verificar la identidad de nadie** con lo que hay en esta versión;
- **no existe detección de edad fiable**, y las que se venden como tal fallan justo en el margen que importa;
- una **casilla** «tengo permiso» no prueba nada y no sobrevive a una reclamación;
- el consentimiento **se puede retirar**, y entonces hay que dejar de generar y poder hacer desaparecer lo generado;
- las fotos y los documentos firmados son **datos personales sensibles**: ni en logs, ni accesibles por URL permanente, ni visibles para otros usuarios.

El riesgo real de esta versión no es técnico: es que el consentimiento quede convertido en una casilla vacía que dé una falsa sensación de cumplimiento.

## Opciones

1. **Casilla de declaración para todo.** Supone que la declaración del usuario basta como base jurídica. Falla primero con la imagen de un tercero: ante una reclamación no hay nada que enseñar, y la prohibición de menores se queda sin ningún control más allá del texto.
2. **Verificación de identidad y edad automáticas** antes de aceptar un personaje. Supone que existe un servicio fiable y asumible. Falla de entrada: no lo hay para edad, y para identidad implicaría subir documentos de identidad de terceros a esta instalación, que es más dato sensible y más riesgo, no menos. Queda para 0.28.0 como moderación, no como puerta.
3. **Fricción proporcional al titular, con prueba y revisión humana para terceros.** Supone que quien administra la instalación puede y quiere mirar los documentos. Falla primero en una instalación desatendida: los personajes de terceros se quedarían en revisión para siempre. Es un fallo visible y sin consecuencias silenciosas, que es la clase de fallo aceptable aquí.

## Decisión

Se elige la **opción 3**, con estas reglas:

- **El consentimiento es una fila propia** (`consent_records`), no una casilla en el personaje: titular, declaración de mayoría de edad, alcance de uso, documento, quién y cuándo lo registró, quién y cuándo lo revisó, y su revocación con fecha y motivo. Un registro no se edita ni se borra: registrar uno nuevo **revoca** el anterior, que se conserva como prueba de qué se declaró y cuándo. Un índice único parcial garantiza que no haya dos sin revocar al mismo tiempo.
- **Fricción según el titular.** «Soy yo» y «animal propio» se registran con la declaración del usuario, su cuenta y la fecha. **Un tercero exige un documento firmado subido**, y el personaje queda `en_revision` y **no genera** hasta que un administrador acepta el documento. Sin documento, el registro se rechaza en lugar de guardarse a medias: un consentimiento de tercero sin prueba es exactamente la casilla vacía que esta decisión quiere evitar.
- **La declaración de mayoría de edad es obligatoria para registrar.** Sin ella no hay registro y, sin registro, el personaje no genera nada. Se documenta expresamente como **control, no como garantía**, en la interfaz, en la guía de usuario y en `docs/legal/`: Escenara no comprueba la edad de nadie. Fingir lo contrario sería peor que no tener el control.
- **El estado del personaje se deduce de los datos**, nunca de una columna de confianza. `characters.state` es solo una caché para listar y filtrar; la puerta de la generación (`server/personajes/puede-generar.ts`) vuelve a leer el consentimiento y las referencias y decide otra vez. Y lee **el último registro, revocado o no**: leer «el vigente» confundiría un consentimiento revocado con no haber registrado ninguno, y el motivo que se le muestra al usuario sería falso.
- **Revocar bloquea al momento**, sin estado intermedio ni periodo de gracia. Lo ya generado se conserva con aviso: borrarlo automáticamente al revocar destruiría trabajo sin que nadie lo hubiera pedido. Quien quiera que desaparezca, borra el personaje.
- **Borrar un personaje borra sus derivados**: los medios generados con él, fila y objeto del almacenamiento, localizados por `generation_jobs.character_id`. Primero la transacción que borra las filas y después los objetos, nunca al revés: así el peor caso es un objeto huérfano, que se registra con su clave, en lugar de filas que apuntan a archivos inexistentes. **Las fotos de referencia no se borran**: son fotos del usuario y pueden estar en otro personaje; lo que se deshace es la relación.
- **Un mínimo de referencias, configurable en el panel.** Tres por defecto (ADR-0013: la configuración vive en el panel, no en `.env`). Por debajo del mínimo el personaje no genera aunque tenga el consentimiento: con una sola foto la identidad se pierde entre fotogramas y el resultado no se parece a nadie.
- **Al generar con un personaje se envían varias referencias**, hasta el tope que declare el modelo en el catálogo (ADR-0015), en el orden que fijó el usuario. Una sola foto era el atajo de 0.10.0; varias dan mucha mejor guía de identidad.
- **Revisión de las referencias antes de enviarlas** (ADR-0009): la reducción de tamaño ya la hace la biblioteca al subir, y el aviso es una confirmación explícita de que en las fotos no aparece ninguna otra persona ni ningún menor. Obligatoria para encolar con personaje, y también un control, no una comprobación.
- **Privacidad por defecto.** Fotos y documentos se sirven con URL temporales firmadas que caducan; solo los ve su dueño, y el administrador solo abre el documento de un tercero para revisarlo. Nada de esto aparece en ningún log. El acceso se decide en el servidor: un personaje ajeno responde 404 en todas las operaciones, y toda petición que cambie datos exige `Origin` del mismo sitio.
- **Un medio en uso avisa antes de borrarse para siempre.** Es la comprobación de uso que se aplazó en 0.8.0 por falta de consumidores: la respuesta es 409 con la lista de personajes afectados, y el borrado solo sigue si se repite con la confirmación.

## Reglas añadidas tras la revisión de código (2026-09-27)

La primera implementación cumplía la decisión sobre el papel y la incumplía en tres sitios. Las tres reglas que
faltaban son parte de la decisión, no un detalle de implementación:

- **El consentimiento se revalida en el momento de enviar, no solo al pedir el trabajo.** Entre encolar y
  despachar puede pasar un rato largo (y en un reintento, más), así que el worker vuelve a comprobar
  `puedeGenerarCon` **antes de subir nada** al proveedor. Sin esto, revocar impedía pedir trabajos nuevos pero
  no impedía que la cara saliera: la mitad de la regla. Un trabajo detenido así se cierra **sin coste**, con el
  motivo real (`consentimiento`), y **no se reintenta**: reintentar esperaría a que alguien devolviera un
  consentimiento que precisamente se ha retirado.
- **Un personaje que alguna vez tuvo consentimiento de tercero lo sigue teniendo.** Cualquier registro
  posterior tiene que ser de tercero, con documento y revisión; no se puede pasar a «soy yo» ni a «un animal
  mío». Si se pudiera, un documento rechazado se eludiría registrando «soy yo» y la revisión humana sería un
  trámite saltable. Una vez que una cara se ha declarado de otra persona, deja de haber una versión de la
  historia en la que sea tuya.
- **El borrado no puede llevarse el dinero de nadie por delante.** `usage_ledger.job_id` es `set null`, así que
  borrar la fila de un trabajo deja su apunte sin referencia y el barrido de reservas huérfanas —que busca por
  `job_id`— dejaría de encontrarlo: la reserva se le quedaría comida al usuario para siempre y en silencio. Por
  eso: los trabajos que no han salido **se cancelan liberando su reserva**; los que ya están en el proveedor
  **impiden el borrado** (409), porque su tarea existe, se va a cobrar y su resultado va a llegar; y no se borra
  ninguna fila con la reserva sin cerrar. El apunte queda anotado con el trabajo y el personaje de los que
  venía, para que el gasto siga siendo auditable sin su `job_id`.

Y tres decisiones de alcance del propietario, tomadas sobre esos hallazgos:

- **Quien administra ve el consentimiento y el documento, nunca las fotos de referencia**, y solo de personajes
  con titular tercero. No es que la interfaz no las muestre: no salen en la respuesta, así que no hay forma de
  mirarlas. Un personaje ajeno sin consentimiento de tercero responde 404 también al admin. **Cada acceso queda
  registrado** en `consent_access_log`: decir «solo lo ve el admin» no vale de nada si no se puede comprobar
  quién lo vio y cuándo.
- **La confirmación de la revisión de referencias se guarda con su fecha**
  (`generation_jobs.references_reviewed_at`), igual que la de derechos. Es una declaración, y una declaración
  sin fecha no prueba nada. Se pide también para el clip que sale de un fotograma con personaje: es otro envío
  de la misma cara, así que es otra confirmación.
- **El documento de consentimiento se guarda sin procesar** (`media.is_document`): sin recortar a 1920 × 1080,
  sin reconvertir a WebP y sin pasar por el editor de imagen, porque lo que hay que poder leer al revisarlo es
  la letra pequeña de una hoja firmada. Y no puede usarse como referencia de un personaje ni como imagen suelta
  en «Crear»: enviarlo al proveedor sería mandarle un documento de identidad ajeno.

También se cierra un agujero de la cadena de derivados: **si la «imagen suelta» de un trabajo es el resultado de
otro trabajo hecho con un personaje, el trabajo nuevo hereda ese personaje**. Sin eso, reeditar o animar un
fotograma generado con una cara la sacaba del alcance del borrado, y la cara sobrevivía al borrado del personaje.

## Reglas añadidas tras la segunda revisión (2026-09-27)

- **Excepción mínima a la decisión de la 0.8.0** («quien administra ve y edita la biblioteca de todos»),
  decidida por el propietario y **pendiente de confirmar**: esa regla sigue en pie salvo para dos cosas, los
  medios con `is_document` y las fotos de referencia de un personaje ajeno. Para quien no es su dueño responden
  404 en todas las operaciones: listado, identificador, archivo, edición y papelera. No es que la interfaz no
  los muestre; no salen de la consulta. Los documentos de terceros se revisan **solo** por `/admin/personajes`,
  que está auditado. La excepción es la mínima que cierra el agujero: sin ella, el aislamiento del apartado
  anterior era una promesa que la biblioteca de administración se saltaba por completo.
- **El documento de consentimiento solo entra por subida directa y solo como JPEG o PNG.** Si se pudiera elegir
  de la biblioteca o traer por URL, habría pasado por el recorte y la recompresión —lo que puede dejar ilegible
  una hoja firmada— y, peor, una **foto del propio personaje podría hacer de documento**: el consentimiento se
  respaldaría con la misma cara que autoriza, que no prueba absolutamente nada. El servidor exige `is_document`
  y rechaza un medio que ya sea referencia de algún personaje.
- **A los documentos se les quitan los metadatos sin recomprimir la imagen.** Una foto hecha con el móvil lleva
  EXIF con la localización de donde se firmó, la marca del teléfono y la fecha exacta: datos personales de más
  que no hacen ninguna falta para revisar una firma. La limpieza es a nivel de contenedor, así que los píxeles
  salen byte a byte idénticos. De ahí la restricción a JPEG y PNG: para WebP y AVIF no hay un recorte igual de
  fiable, y recomprimir para limpiar metadatos sería perder legibilidad justo donde no se puede.
- **El documento de un consentimiento vigente no se borra** (409): es la prueba que sostiene al personaje, y sin
  ella el personaje seguiría generando sin nada que lo respalde. Primero se revoca y después se borra.
- **Una foto en la papelera no cuenta para el mínimo, y la cola lo comprueba al enviar.** El despacho cruza las
  referencias que guardó el trabajo con las que siguen siendo del personaje y están fuera de la papelera; si
  quedan por debajo del mínimo, cierra sin subir nada. Revalidar el consentimiento no basta si lo que ha
  cambiado son las fotos.
- **El índice parcial de «un consentimiento vigente por personaje» se declara en el esquema**, no solo en el SQL
  de la migración: el esquema es la única fuente de verdad y, si no estuviera, la siguiente migración generada
  propondría borrarlo. La migración que lo pone al día es idempotente (`IF NOT EXISTS`).
- **La cola de revisión va paginada y deja un solo apunte de auditoría por carga.** Un apunte por personaje
  llenaría el registro de ruido cada vez que alguien entra a ver si hay trabajo pendiente, y en ese listado no
  se ve ningún documento. Lo que hay que poder auditar es quién abrió el documento de un personaje concreto, y
  eso lo apunta la ficha.

## Consecuencias

- Una instalación sin nadie que administre no puede usar personajes de terceros. Es a propósito: preferimos un personaje parado a una cara ajena enviada sin que nadie haya mirado nada.
- El documento se sube como **imagen** (foto o escaneo), porque la biblioteca admite imagen, vídeo y audio. Admitir PDF es alcance de otra versión.
- Quien administra puede leer documentos de identidad de terceros. Es una capacidad delicada y está acotada a una pantalla, `/admin/personajes`, para que se vea qué se está haciendo.
- La revocación no toca lo generado, así que el cumplimiento del «derecho al olvido» sobre lo ya publicado depende de que alguien borre el personaje. La guía de usuario lo dice sin rodeos.
- Un trabajo en el proveedor retrasa el borrado del personaje. Es el precio de no mentir sobre el gasto ni dejar
  entrar en la biblioteca un resultado sin personaje al que borrarlo. Para dejar de generar con él al momento,
  revocar el consentimiento basta y es inmediato.
- El registro de accesos crece con cada revisión. Son unas pocas filas por personaje de tercero y no guarda
  contenido, así que no hay nada que purgar en esta versión; si algún día lo hubiera, la política de retención
  va en `docs/legal/`.
- Falta lo que llega después: captura guiada y cobertura de vistas (0.14.0), ficha y versiones de personaje (0.15.0), y verificación de identidad, detección de edad y moderación de comunidad (0.28.0).
