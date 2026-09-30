# Cumplimiento, privacidad y límites de contenido

**Estado:** lista de trabajo; **no sustituye** la revisión jurídica especializada que exige el PRD (§8) antes del lanzamiento · **Versión objetivo:** 0.30.0, con controles técnicos repartidos en versiones anteriores

## Marco a revisar

| Ámbito | Qué comprobar | Versión |
|---|---|---|
| RGPD y LOPDGDD | Base jurídica, consentimiento explícito para fotos de rostro y voz, evaluación de impacto (EIPD), encargados del tratamiento (proveedores de IA con claves del usuario), transferencias internacionales, derechos de acceso y supresión | 0.12.0 y 0.30.0 |
| Derecho a la propia imagen (LO 1/1982) | Consentimiento del titular para uso comercial de su imagen y voz; revocación | 0.12.0 |
| Reglamento de IA de la UE, art. 50 | Transparencia del contenido sintético y deepfakes: aplicable desde el 2 de agosto de 2026 según el calendario original. Comprobar el estado del paquete «Omnibus digital» y de la normativa española de etiquetado | 0.21.0 y 0.30.0 |
| Publicidad | Afirmaciones sobre productos, salud y lugares con fuente y aprobación editorial; identificación de contenido publicitario | 0.16.0 |
| Términos de proveedores | Políticas de uso de Google, KIE y cada modelo; restricciones regionales de generación de personas | 0.3.0 y 0.10.0 |
| Licencias | Licencia del repositorio: AGPL 3.0 (ADR-0001); licencias de modelos, fuentes (Manrope, OFL), música y recursos | 0.2.0 y 0.31.0 |
| Marca y nombre | Disponibilidad de «Escenara» en OEPM y EUIPO, dominios y cuentas | Antes de 0.6.0 |

## Controles del producto

- [x] Declaración de derechos y consentimiento antes de usar cualquier personaje (RF10). **0.13.0**: registro de consentimiento con titular, alcance de uso, fecha y cuenta; sin consentimiento vigente el personaje no genera nada, y la comprobación está en el servidor, no en la interfaz.
- [x] **Dos personas reales en la misma escena (0.28.0)**: hacen falta dos consentimientos vigentes, uno por cada personaje. La puerta del servidor comprueba ambos y la pantalla nombra a quien le falte. **Criterio provisional**: basta el consentimiento individual de 0.13.0 para cada persona; aún no hay texto adicional específico sobre aparecer conversando con otra. Antes de publicar una política definitiva debe revisarse ese alcance con asesoramiento jurídico. Un personaje inventado aporta su declaración de personaje inventado y la persona real su consentimiento.
- [ ] Autorización de voz independiente de la de imagen. *(0.13.0 registra el alcance de uso —personal o comercial— aparte de la imagen; la voz llega con la clonación de voz.)*
- [x] Prohibición de menores como avatar: declaración, filtros del proveedor y moderación. Es un control, no una garantía. **0.13.0**: la declaración de mayoría de edad es obligatoria para registrar el consentimiento y, sin registro, el personaje queda bloqueado. Ver el aviso de alcance más abajo.
- [ ] Bloqueo de desnudez sexual, acoso, suplantación y respaldo falso de personas reales.
- [x] Terceros solo con documento de consentimiento y revisión; nunca publicables en la comunidad. **0.13.0**: el titular «otra persona» exige un documento firmado subido y el personaje queda en revisión hasta que un administrador lo acepta (ADR-0017). La comunidad llega en 0.28.0 y estos personajes no se publicarán.
- [x] Borrado de personaje con todos sus derivados. **0.13.0**: borra el personaje, su consentimiento, sus relaciones con las fotos y los medios generados con él, fila y objeto del almacenamiento, con registro de las claves borradas. Las fotos de referencia se conservan en la biblioteca del usuario a propósito (son suyas y pueden estar en otro personaje). **0.47.0**: el borrado de un **proyecto** se lleva sus escenas, trabajos, fotogramas, clips y voces generados, vídeos montados y paquetes exportados (fila y objeto); el de la **cuenta**, todo lo suyo. Ver «Borrado y retención» más abajo.
- [ ] Etiqueta visible de contenido sintético en todas las exportaciones, incluidas las totalmente animadas (0.31.0). C2PA sigue pendiente de 0.46.0.
- [ ] Sugerencias de salud informativas, revisables y sin promesas de diagnóstico ni curación.
- [x] Aviso de qué proveedor procesará los archivos **y los textos** antes de enviarlos. **0.17.0**: el formulario de consentimiento dice que al generar con ese personaje se envían a KIE sus fotos **y el texto de su ficha** (rasgos, estilo, vestuario, personalidad y descripción), que forma parte del prompt; y que si la instalación traduce los prompts al inglés, ese texto pasa además por el **modelo de texto** de KIE. La zona de coste de «Crear» dice lo mismo antes de gastar.
- [ ] Credenciales cifradas, excluidas de logs y nunca devueltas íntegras al navegador.
- [ ] Protección contra SSRF en URLs externas y límites de uso por cuenta.

## Alcance real del control de menores y de identidad (0.13.0)

Escrito aquí para no repetirlo con eufemismos en cada pantalla:

- **Escenara no comprueba la edad de nadie.** No existe detección de edad fiable y no se usa ninguna. Lo que hay es una **declaración obligatoria** de mayoría de edad, guardada con la cuenta que la hizo y su fecha, más el bloqueo del personaje si falta. Es un **control de producto y una trazabilidad de la declaración**, no una verificación ni una garantía.
- **Escenara no comprueba la identidad de nadie.** Para la imagen de un tercero exige un documento de consentimiento firmado y una **revisión humana** de quien administra la instalación. Esa revisión valora el documento; no autentica al firmante ni verifica que sea quien dice ser.
- **Lo que sí se puede demostrar** es qué se declaró, quién lo declaró, cuándo, con qué alcance de uso, quién lo revisó y cuándo se revocó. Los registros revocados no se borran por eso mismo.
- **Riesgos que quedan abiertos** y que esta versión no cierra: una declaración falsa, un documento falsificado, un personaje creado a partir de fotos obtenidas sin permiso, y la moderación de lo ya generado. Se mitigan en 0.28.0 (moderación de comunidad) y con los filtros de contenido de los propios proveedores. Cualquier texto público del producto debe describir estos controles como controles, sin dar a entender verificación.
- **Datos personales implicados**: fotos de rostro, documentos de consentimiento firmados y **el texto de la ficha** del personaje. Las **fotos solo las ve su dueño**: no salen en ninguna respuesta dirigida a otra persona, tampoco a quien administra. Del documento de un tercero, quien administra ve únicamente ese documento, en `/admin/personajes`, y **cada acceso queda registrado** (quién, cuándo, qué personaje y qué hizo) en `consent_access_log`. Ni los documentos ni las fotos de referencia aparecen en la biblioteca de administración (`/admin/medios`): para quien no es su dueño responden como si no existieran. A los documentos se les quitan los metadatos al guardarlos, **incluida la localización** de la foto, sin recomprimir la imagen. Se sirven con URL temporales firmadas que caducan y no aparecen en ningún registro del servidor. Antes del lanzamiento hay que reflejar este tratamiento (y el plazo de conservación de los documentos) en la política de privacidad y en la EIPD.

## El texto de la ficha también sale hacia el proveedor (0.17.0)

La ficha de un personaje (rasgos, estilo, vestuario, personalidad y descripción) **no es solo archivo**: desde la
0.15.0 entra en el prompt de cada fotograma y de cada clip, así que **se procesa en KIE** igual que sus fotos. Y
desde la 0.17.0, si la instalación tiene encendida la traducción de los prompts al inglés (decisión firme del
propietario, ADR-0020), ese texto pasa **además** por el modelo de texto de KIE.

Consecuencias que hay que sostener:

- **se dice antes de consentir**: el formulario de consentimiento lo enuncia, y no solo para las fotos;
- **la traducción de una ficha se guarda con la cuenta de su dueño**, nunca en una caché común: es la descripción
  de una persona, y compartirla entre cuentas la convertiría en material de otro (decisión provisional del
  propietario, 2026-09-27);
- **se borra con el personaje**, en la misma operación que sus derivados y su consentimiento, y se purga sola
  cuando nadie la usa desde hace más de lo configurado en Admin › Ajustes;
- del texto de origen **solo se guarda su huella**, así que la caché no es una segunda copia de lo que se escribió.

Queda pendiente para la política de privacidad: nombrar KIE como **encargado del tratamiento** también para texto,
no solo para imagen y vídeo, y decir el plazo de conservación de las traducciones.

## Servicios que paga la instalación y reciben texto (0.39.0)

Además de los proveedores con las claves del usuario, hay un servicio que se usa con la **clave del operador** de
la instalación. Aquí se describe qué recibe, sin calificarlo jurídicamente: la calificación, la base jurídica, el
contrato de encargo y las transferencias internacionales están **pendientes de revisión jurídica**.

| Servicio | Para qué | Qué recibe | Qué no recibe | Cuándo | Estado |
|---|---|---|---|---|---|
| TypeSafe (Jev), como encargado del tratamiento de la instalación | Evaluar en sombra si el guion de una escena tiene una afirmación que exige verificación (0.39.0) | El texto del guion y de la descripción de la escena, con los nombres de los personajes y del producto sustituidos por marcadores | Imágenes, audio, nombres de personas, correos. Las escenas con una persona real no se envían nunca | Solo con la sombra **encendida** en Admin › Ajustes, que viene apagada y exige marcar antes una casilla de que se entiende este envío | Pendiente de revisión jurídica y de figurar en la política de privacidad antes de encenderla en producción |
| TypeSafe (Jev), como encargado del tratamiento de la instalación | Decidir las comprobaciones de coherencia (0.24.0) que alguien pide desde la ficha o la revisión | Los hechos que describió la percepción (texto) y el guion o la descripción con que se comparan | Imágenes ni audio: esos solo van a la percepción, con el mapa de modelos del usuario | Cuando alguien pulsa «Comprobar» y la comprobación no está apagada | Pendiente de revisión jurídica y de figurar en la política de privacidad |

El registro de decisiones (Admin › Decisiones) guarda qué se miró en cada decisión de los controles **sin nombres**
de personas ni de productos: se sustituyen por un marcador al escribir, se vuelven a quitar al leer y la migración
de la 0.39.0 los quita de las filas anteriores. Así, borrar la ficha de una persona no deja su nombre en un registro
que sobrevive a ese borrado.

## Fotos de lugares, que pueden llevar personas (0.46.0)

Un lugar es un sitio que el usuario reutiliza como escenario, con fotos suyas. Esas fotos **pueden contener
personas que no han dado su consentimiento**: gente al fondo de una calle o de un bar. Lo que hace la aplicación, sin
calificarlo jurídicamente (la calificación, la base jurídica y el encargo del tratamiento están **pendientes de
revisión jurídica**):

- **La declaración del lugar es del usuario** y se lo dice la pantalla donde la firma: de dónde son las fotos, si hay
  permiso del sitio en un interior, si se ve gente y cómo, y que no sale ningún menor. Escenara no revisa las fotos y
  la responsabilidad de lo declarado es de quien declara. Se guarda con su fecha, su cuenta y la versión del texto, y
  no se borra al borrar el lugar.
- **No se admite gente reconocible** en una foto declarada ni **ningún menor**. No hay detector de caras: la columna
  `place_references.people_check` existe y hoy vale siempre «sin comprobar»; comprobarlo con un modelo es una propuesta
  no entregada.
- **Generar con un lugar envía su foto maestra** a KIE y al proveedor del modelo de imagen, junto a las fotos del
  personaje, igual que cualquier otra referencia.
- **«Retirar personas» envía la foto con la gente** a KIE y al proveedor del modelo de edición para quitarla: es la
  única forma de hacerlo, y por eso ocurre **antes** de que la foto pueda declararse. La foto editada se guarda en la
  biblioteca del usuario como generada; la original no se borra. El diálogo del encargo lo dice antes de pagar: «esta
  foto se envía tal cual, con las personas que salen en ella, a KIE y al proveedor del modelo que la edita». No hay
  casilla expresa para ese envío.
- **Al borrar la cuenta, sus declaraciones de lugar se borran** y queda solo una prueba anónima (0.47.0): ver «Borrado
  y retención». Borrar **un lugar** sigue conservando sus declaraciones, revocadas y con el nombre del lugar, mientras
  exista la cuenta.
- **La comprobación de coherencia del lugar** (en sombra) envía la foto maestra y el fotograma a la percepción del
  mapa del usuario, con la instrucción de no describir a nadie, y **no se hace** si en la escena sale una persona real.

Queda pendiente para la revisión jurídica: si «Retirar personas» debe exigir una casilla expresa, cómo figuran estos
envíos en la política de privacidad y si un espacio público permite usar la foto en un anuncio.

## La etiqueta de contenido sintético en lo que se exporta (0.32.0)

Desde la 0.32.0 Escenara **entrega el vídeo terminado**. El [artículo 50 del Reglamento de IA de la UE](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50),
aplicable desde el 2 de agosto de 2026, distingue la divulgación de contenidos que constituyen una falsificación
ultrarrealista por quien los utiliza de la marca legible por máquina que puede corresponder al proveedor del sistema.
La etiqueta visible de Escenara es una medida de transparencia del producto, **no una declaración de cumplimiento
integral** de ambas obligaciones.

Cómo se cumple, y hasta dónde:

- **El rótulo es fijo y lo dibuja el servidor.** Dice `Contenido generado con IA`, se compone dentro del propio
  render y no viaja como texto del usuario: no se puede sustituir por otra frase ni por una imagen.
- **La etiqueta es obligatoria en toda exportación por diseño del producto.** Cuenta igual una persona real, una
  inventada o un personaje completamente animado. Esto no presupone que todos esos casos encajen jurídicamente
  en la definición de falsificación ultrarrealista. Lo impide el servidor al guardar el montaje, no la pantalla.
- **Se elige la posición, no la existencia**: arriba o abajo, siempre dentro de la zona segura para que la interfaz
  de la plataforma no la tape.
- **Sin poder dibujarla no se exporta.** Si a la instalación le falta una fuente o el soporte de texto de FFmpeg, la
  exportación se detiene con el motivo. Entregar el MP4 sin etiqueta contradiría la regla de transparencia que
  Escenara aplica a todos los vídeos que exporta.
- **Lo que la etiqueta no es.** No es una marca legible por máquina ni una firma de procedencia: **C2PA y los
  metadatos de procedencia quedan para la 0.46.0**. Hasta entonces un vídeo recortado puede perder el rótulo sin
  dejar rastro comprobable; la obligación que resulte aplicable a cada operador requiere una revisión separada.
- **No sustituye a la declaración de la plataforma.** TikTok, Reels y Shorts piden marcar el contenido generado con
  IA al publicar. La guía de usuario lo dice, pero Escenara **no puede comprobarlo**, porque no publica por ti.
- **También en vídeos sin personas o completamente animados es obligatoria.** El propietario mantendrá esta regla
  hasta la revisión legal prevista para la 0.46.0.

Queda pendiente para los documentos públicos: describir esta etiqueta en la **guía de etiquetado de contenido
sintético** de la lista de abajo, y decir que la obligación de declarar en la plataforma sigue siendo de quien
publica.

## Borrado y retención (0.47.0) · pendiente de revisión jurídica

El usuario puede borrar un proyecto, un personaje, un producto, un lugar o **la cuenta entera** (derecho de supresión).
Lo que se hace, con su motivo, para que la revisión jurídica lo confirme o lo cambie:

- **Borrar la cuenta** exige haber entrado hace menos de 10 minutos, escribir una frase y pasar un **periodo de
  gracia** (7 días de fábrica, configurable en Admin › Ajustes) con la cuenta desactivada y el borrado cancelable. El
  único administrador no puede borrarse. Pasado el plazo se borran en una transacción las filas de la cuenta (proyectos,
  personajes, productos, lugares, medios, credenciales cifradas, passkeys, sesiones, presupuesto, historial, apuntes de
  gasto, kit de marca, preferencias, decisiones de coherencia y evaluaciones de controles, y los contadores de intentos
  ligados a su correo) y después los **objetos del almacenamiento**. Las claves de esos objetos se apuntan en
  `storage_deletions` **en la misma transacción** que borra las filas; el worker los reintenta con retroceso (hasta 8
  intentos) y la fila se borra al borrar el objeto. Los que agotan los intentos quedan como «fallidos», con su clave,
  visibles para quien administra en Admin › Ajustes › Tus datos, que tiene que limpiarlos a mano. Lo mismo al borrar
  un **proyecto**. Las claves no incluyen el identificador de la cuenta (son identificadores aleatorios), y la fila
  desaparece con el objeto. Quien administra puede volver a poner en cola los fallidos desde el panel.
- **Durante la gracia** la cuenta no puede generar ni gastar (el encolado lo rechaza y el worker no envía nada suyo),
  editar ni subir, ni cambiar su correo con sesión, añadir passkeys o vincular cuentas, ni borrarse por otra vía; sí
  entrar y salir, cerrar sesiones, cancelar el borrado, ver su historial y pedir o descargar la exportación de sus
  proyectos (portabilidad). **Restablecer la contraseña** por correo sigue disponible, responde igual que para
  cualquier otra cuenta (no revela si está en gracia) y **cancela el borrado**: quien controla el buzón puede recuperar
  la cuenta si otra persona le cambió la contraseña y pidió borrarla. El titular recibe un correo al pedir y al
  cancelar el borrado (también si lo cancela un restablecimiento), sin enlaces que permitan cancelar sin entrar. Las rutas de administración de cuentas de la librería (suplantar, cambiar rol, borrar usuarios) están
  desactivadas: todo borrado de cuenta pasa por este flujo, con su retención.
- Si el borrado tiene que esperar (un trabajo en el proveedor, el único administrador…), el motivo se enseña al usuario
  y a quien administra. Un trabajo **sin respuesta del proveedor** ya salió y pudo cobrarse: solo retiene el borrado unos
  días más (3 de fábrica); después se consulta una última vez y, si sigue sin respuesta, su coste **estimado** se
  conserva en el agregado marcado como **no confirmado** (no se afirma que no se cobrara).
- **Gasto**: se conserva solo **agregado** por mes, proveedor, modelo y tipo de apunte (`usage_aggregates`), sin
  cuenta, trabajo, nota ni fecha exacta. Motivo: trazabilidad del gasto de la instalación (decisión 3 de la fase).
- **Consentimientos y declaraciones de derechos** (consentimiento de un personaje, declaración de un lugar, de una
  canción y de una afirmación sensible del anuncio): se conserva una **prueba mínima y anónima** (`consent_evidence`):
  tipo, alcance, versión del texto aceptado (o su huella SHA-256 cuando lo guardado era el texto entero), casillas
  declaradas (mayoría de edad, sin menores, permiso del sitio…) y fechas de declaración y revocación. **Sin** nombre
  de la cuenta, correo, nombres de personas ni de lugares, fotos, documentos ni IP. Motivo: poder demostrar que se
  pidió la declaración y con qué texto, sin conservar datos de nadie. **Alternativa**: borrarlas del todo; es la
  pregunta abierta para la revisión jurídica.
- **Registro del borrado** (`account_deletions`): fechas, estado, motivo de espera (sin datos de nadie) y recuentos por
  tipo, incluidos los objetos huérfanos. Sin claves de objetos ni cuenta: la referencia queda a nulo al borrarse.
- **Ejemplos de plantillas** publicados por un administrador que borra su cuenta: la plantilla de la instalación se
  queda sin ejemplo; nunca se borra un medio de otra cuenta.
- **Borrar un personaje** sigue borrando su consentimiento sin dejar prueba anónima (decisión de 0.13.0). Si la
  revisión jurídica pide conservar la prueba también ahí, se reutiliza la misma tabla.
- **Exportar un proyecto** (portabilidad) entrega un ZIP sin credenciales, prompts ni datos de otra cuenta; caduca a
  las 24 horas de fábrica y el worker lo borra.

Preguntas para la revisión jurídica: si la prueba anónima es suficiente y proporcionada o debe borrarse; si 7 días de
gracia es un plazo adecuado; si el agregado del gasto necesita mención en la política de privacidad; y cómo se informa
de que las copias de seguridad de la base de datos que haga quien administra siguen conteniendo los datos hasta que
caducan.

## Conjunto etiquetado para calibrar umbrales (0.48.0) · pendiente de revisión jurídica

Para medir si un evaluador automático acertaría antes de darle ningún poder, la instalación construye un **conjunto
etiquetado** con revisiones que las personas ya hicieron al usar Escenara: lo que resolvieron sobre las afirmaciones
señaladas en su guion y la corrección del veredicto o la revisión de su clip. No se pide a nadie que etiquete nada ni se
envía nada a ningún proveedor para construirlo.

- **Qué se guarda** (`labeled_examples`): de cada opinión, dos números (cuánto encaja y con qué confianza), la etiqueta
  humana (acepta o rechaza), la partición, la versión de la pregunta y el modelo que contestó. **Sin** texto del guion ni
  de la escena, nombres, correos ni identificadores de usuario.
- **Está seudonimizado, no anonimizado** (sin datos personales; vinculado a la opinión de origen y eliminado al borrar
  la cuenta). **Por qué es seudónimo y no anónimo**: cada fila apunta a la opinión de la que sale, que sí es de una cuenta. Esa
  referencia existe para borrar: la fila se borra **en cascada** con la opinión, y la opinión se borra al borrar la
  cuenta. Al reconstruir el conjunto desaparece además lo que ya no tiene etiqueta (por ejemplo, un proyecto borrado).
- **Dónde está**: solo en la base de datos de la instalación. No se exporta, no se comparte ni sale del servidor, y
  solo lo ve quien administra en Admin › Calibración (cifras agregadas, nunca filas).
- **Para qué**: proponer un umbral por pregunta y medirlo. Proponer no activa nada.

Preguntas para la revisión jurídica: si la base legal del tratamiento (interés legítimo en medir la calidad del
servicio) basta o hace falta informarlo en la política de privacidad; y si conviene desvincular del todo las filas del
origen (anonimizarlas) al borrar la cuenta en lugar de borrarlas, que es lo que se hace hoy.

## Comunidad: lo que una cuenta enseña a las demás (0.49.0) · pendiente de revisión jurídica

La comunidad (apagada de fábrica) deja que una cuenta enseñe a las demás de la instalación **contenido sintético**:
personajes inventados y lo generado con ellos. El sistema comprueba el origen por lista blanca sobre lo que cada trabajo
**envió al proveedor** (todas sus referencias y su audio, tal como quedaron al generarlo, y hacia atrás): nunca una
foto subida (tampoco marcada «hecha con IA»), una persona o mascota real, un producto, un lugar con fotos ni un audio
subido; lo borrado o ilegible no se puede comprobar y no se publica. Nada se ve sin la aprobación previa de una persona
con rol de administrador, que no puede aprobar lo suyo y ve esa procedencia.

- **Qué se guarda y se enseña**: una **copia** del archivo o de las imágenes del personaje, y el título, la descripción
  y la firma que escribe el autor, con su **declaración expresa** («confirmo que es sintético y quiero publicarlo»)
  guardada con su texto y su fecha. Nunca el prompt, el modelo, el correo ni el nombre de la cuenta.
- **Quién lo ve**: las cuentas de la instalación con sesión, solo lo aprobado. No es público en internet.
- **Retirar y borrar**: retirar o rechazar borra la copia; borrar el original o la cuenta la retira también (en la
  gracia deja de verse al momento); la papelera y revocar la declaración de inventado la ocultan. Lo propio se exporta
  desde la comunidad (JSON, también en la gracia) y en el ZIP de cada proyecto.
- **Texto libre**: se publica el título, la descripción y la firma que escribe el autor al publicar (comprobados contra la
  lista de personas conocidas: es un control, no una verificación); nunca el texto alternativo de la biblioteca.
- **Moderación**: el motivo de un rechazo lo lee el autor; quién y cuándo decidió queda en la publicación.

Preguntas para la revisión jurídica: si la instalación actúa como prestador de un servicio de alojamiento de contenido
de terceros (y qué obligaciones de retirada y de aviso tiene), si la firma elegida por el autor basta como autoría, y
cuánto tiempo conservar el registro de decisiones de moderación de lo ya retirado (hoy se borra con la publicación).

## Documentos públicos necesarios antes de 1.0.0

Para cantar con audio propio, la persona que sube el archivo declara si es música propia, música con licencia
(identificando la licencia) o audio hablado propio. Se registra el texto aceptado, su fecha y la IP. Esta declaración
no verifica la titularidad ni sustituye la autorización de imagen y voz del personaje. La generación queda bloqueada
si falta cualquiera de las dos autorizaciones. La política pública deberá explicar que el audio y el retrato se
transmiten al proveedor de generación al confirmar el clip, además de su conservación y borrado.

Términos de uso, política de privacidad, política de contenido aceptable, política de cookies (si aplica), plantilla de consentimiento de imagen y voz para terceros y guía de etiquetado de contenido sintético.
