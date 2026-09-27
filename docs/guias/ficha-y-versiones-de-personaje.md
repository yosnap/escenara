# La ficha y las versiones de un personaje

**Versión:** 0.15.0 · **Para:** quien usa Escenara

Las fotos fijan la cara de un personaje. Lo que no fijan es todo lo demás: la edad que aparenta, la ropa que
suele llevar, la estética con la que quieres retratarlo o cómo está delante de la cámara. Desde la 0.15.0 eso
se escribe en su **ficha**, y la ficha **se envía con cada fotograma y cada clip** como contexto. No es un
archivo que se rellena y se olvida: es parte de lo que se le pide al modelo.

Y como la ficha cambia lo que se envía, **cada cambio de apariencia crea una versión**. Así siempre se puede
decir con qué apariencia se generó cada cosa.

## Dónde está

En `/personajes/[id]` hay tres pestañas:

| Pestaña | Para qué |
|---|---|
| **Ficha** | Los cinco campos de apariencia, la descripción y el botón «Ver lo que se enviará» |
| **Referencias** | Las vistas que faltan, la captura guiada y las fotos que tiene ([«Buenas referencias»](buenas-referencias.md)) |
| **Versiones** | El historial, la hoja de personaje y la comparación de dos versiones |

El consentimiento queda fuera de las pestañas, siempre a la vista: es la puerta que decide si se puede generar
([«Crear un personaje»](crear-un-personaje.md)).

## Los cinco campos

| Campo | Qué poner |
|---|---|
| **Rasgos físicos** | Edad aparente, complexión, pelo, ojos, piel y señas que no deberían cambiar entre escenas |
| **Estilo visual** | La estética con la que se le retrata: época, luz, referencias visuales |
| **Vestuario habitual** | Lo que suele llevar puesto. Cada escena puede cambiarlo en su descripción |
| **Personalidad** | Cómo está delante de la cámara: gesto, energía, postura |
| **Voz prevista** | Cómo suena (timbre, ritmo, acento) |

La **descripción** del personaje entra también en el contexto, en la primera línea del bloque, y pasa por la
misma limpieza y el mismo tope que los cinco campos. Si tu personaje ya tenía descripción de antes, ese texto
empieza a viajar en cada prompt desde la 0.15.0.

Cada campo admite 300 caracteres. Es corto a propósito: esto se suma a **cada** prompt, y un contexto largo
acaba tapando la escena que de verdad querías.

La **voz solo se declara**. Aquí no se genera audio con ella: eso llega en una versión posterior. Se escribe
ahora para que el personaje esté descrito entero y para que el clip sepa a qué atenerse.

### Lo que Escenara quita de tu texto

El prompt lo **compone el servidor**, no el navegador, y tu texto se limpia antes de entrar en él:

- se juntan los espacios y desaparecen los saltos de línea;
- se quitan los caracteres que romperían el prompt (`{}`, `[]`, `<>`, `` ` ``);
- se quitan los **parámetros del proveedor**, escritos como sea: con signo igual (`aspect_ratio: 21:9`,
  `negative_prompt=…`), como bandera (`--seed=42`, y también `—ar 16:9` con el guion largo que pone el
  corrector) o en texto corriente («en resolución 4k», «duration 10», «1080p»);
- y si una frase intenta redirigir las instrucciones («ignora lo anterior…», «system prompt…», «actúa
  como…»), se descarta **la frase entera**, no solo esas palabras: lo que venía detrás era justo lo que se
  quería colar. Lo que está en otras frases se conserva.

Cuando la limpieza cambia algo, la ayuda del campo te dice, antes de guardar, **exactamente** qué se va a
enviar. No es censura: es que un campo de vestuario no puede cambiar la resolución de la imagen.

## Ver lo que se enviará, antes de gastar

En la ficha, **«Ver lo que se enviará»** dice de qué versión sale el contexto y **qué fotos** se enviarían. Se
resuelve con la **versión guardada**, así que mientras tengas cambios sin guardar el botón está desactivado:
primero guarda. En **«Crear»**, lo mismo aparece en el paso 3, justo encima del botón de generar, con:

- si tu ficha está aportando contexto o si está vacía;
- las miniaturas de las fotos elegidas, con su vista y su etiqueta de origen;
- cuántas de las que admite el modelo se están usando.

**El texto que se compone con tu ficha no se muestra** (desde la 0.17.0): el prompt es material de Escenara y del
panel de administración. Lo que sí se te dice es de dónde sale y qué se envía con él.

Mirarlo no cuesta nada: es una lectura, no encola ningún trabajo, no toca al proveedor y no cambia nada en tu
cuenta.

Y si la ficha cambia entre que lo miras y que pulsas —porque la editas en otra pestaña, o porque termina una
vista generada y entra como referencia nueva—, el envío se **rechaza** con un aviso en lugar de gastar: «la
ficha ha cambiado desde que la revisaste». Vuelve a mirar el contexto y confirma otra vez.

### Qué fotos se envían

No van «las primeras»: van **las mejores por cobertura de vistas**. Primero una foto original de cada vista
mínima (de frente, perfil izquierdo, perfil derecho, tres cuartos, cuerpo completo), después el resto de fotos
originales y, al final, las vistas generadas. Si el modelo admite diez y tienes quince, se envía una de cada
ángulo en lugar de diez de la misma pose.

## Versiones: qué las crea y qué no

**Crean versión** los cambios que cambian lo que ve el modelo:

- cualquiera de los cinco campos de la ficha;
- la descripción;
- añadir, quitar o **reordenar** fotos de referencia (el orden decide qué se envía primero).

**No crean versión** los metadatos: el nombre y las notas de especie. Y guardar el mismo texto otra vez
tampoco: puedes editar varias veces en una sesión sin llenar el historial de versiones idénticas.

El campo **«Motivo del cambio»** es opcional y queda escrito en la versión que produzca el cambio. Ponlo: seis
meses después, «Ahora lleva gafas» explica el historial mucho mejor que una fecha.

### Las versiones no se borran

Son la trazabilidad de lo que ya generaste. Cada fotograma y cada clip **cita la versión** con la que salió, y
sigue citándola después de que cambies la ficha: un trabajo hecho con la versión 2 sigue llevando el contexto
de la 2 cuando ya existe la 3. Un clip hereda la versión **de su fotograma**, no la vigente, porque animar
tiene que seguir siendo el mismo personaje que se generó.

Las versiones solo desaparecen al **borrar el personaje**, que se lleva también su hoja de personaje y los
vídeos y fotogramas hechos con él.

### Aprobaciones invalidadas

Si algo estaba aprobado con la versión anterior, al crear una versión nueva queda **marcado para revisar**, con
la fecha, qué lo invalidó y qué hacer: «vuelve a revisar la escena: se aprobó con una apariencia que ya no es
la vigente». Aparece arriba en la pestaña «Versiones». Las aprobaciones de guion y escenas completas llegan en
una versión posterior; esta es la parte que evita que algo se dé por bueno con una apariencia que ya cambió.

### Comparar dos versiones

Abajo en «Versiones», elige dos y se ven **lado a lado**, campo por campo, con la etiqueta «Cambia» en las
filas que difieren.

## La hoja de personaje

Es un montaje de hasta nueve de sus fotos, con su nombre arriba y la vista debajo de cada una. Sirve para
verlo todo de un vistazo y para mandársela a quien te ayude con las escenas.

Se compone **en el servidor y sin ninguna IA**: no gasta créditos, no pasa por la cola y rehacerla es gratis.
Es material reservado, como tus fotos de referencia: **quien administra la instalación no la ve** ni en la
biblioteca ni por la API.
Hay **una por versión**, y rehacerla dentro de la misma versión sustituye la anterior, así que no se te llena
la biblioteca de hojas repetidas. Eso sí: ocupa cuota de tu biblioteca, como cualquier otro archivo tuyo.

## Quién ve qué

- **Tu ficha, tu hoja y tu contexto de generación son tuyos.** Nadie más los ve, tampoco quien administra la
  instalación.
- Quien administra alcanza el **historial de versiones** de un personaje **solo** si tiene o tuvo un
  consentimiento de otra persona (que es lo que le corresponde revisar), y lo ve **sin el contenido de la
  ficha, sin el contexto y sin la hoja**: números, fechas, motivos y qué campo cambió. Cada acceso queda
  registrado.

## Si vienes de la 0.14.0

- Tus personajes reciben su **versión 1** al aplicar la migración, con lo que tengan en ese momento.
- Los cinco campos empiezan **vacíos**, pero la **descripción** no: si tus personajes ya tenían una, ese texto
  empieza a ir en cada prompt. Revísalo antes de generar.
- En cuanto escribas algo, ese texto va en **cada** fotograma y **cada** clip. Compruébalo una vez en «Ver lo que
  se enviará» antes de generar: ahí se dice si tu ficha está aportando contexto y con qué fotos.
