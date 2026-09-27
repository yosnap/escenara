# Crear un personaje y registrar su consentimiento

**Versión:** 0.13.0 · **Para:** quien usa Escenara

Un **personaje** es una persona o un animal con sus fotos de referencia y su consentimiento de uso de imagen.
Es lo que mantiene la misma cara entre vídeos: al generar, Escenara le manda al modelo **varias** fotos del
personaje en lugar de una sola, y eso guía mucho mejor la identidad.

La regla de la que cuelga todo lo demás: **sin consentimiento vigente no se puede generar con un personaje**.
No es una casilla decorativa; lo comprueba el servidor antes de encargar nada al proveedor.

## 1. Crea el personaje

1. Entra en **Personajes → Nuevo personaje**.
2. Elige si es una **persona** o un **animal** y ponle un nombre. Dos personajes tuyos no pueden llamarse igual.
3. La especie o las notas y la descripción son opcionales y son para ti: la ficha que se le pasa al modelo como
   contexto llega en una versión posterior.

## 2. Sube sus fotos de referencia

Necesitas al menos **3 fotos** (quien administra la instalación puede cambiar ese mínimo en
**Admin › Ajustes › Personajes**). Puedes subirlas, arrastrarlas o elegirlas de tu biblioteca.

Lo que funciona mejor, por lo que se vio comparando modelos:

- la **misma** persona o animal en todas;
- ángulos distintos (de frente, de perfil, tres cuartos) y luces distintas;
- la cara nítida y sin gafas de sol ni objetos que la tapen;
- nadie más en la foto.

Las fotos se guardan en tu biblioteca como cualquier otra imagen: se reducen a 1920 × 1080 como máximo y se
convierten a WebP al subirlas. La **primera** referencia es la portada del personaje y la que más peso tiene en
la identidad; el orden se cambia desde su ficha **arrastrando** cada foto por su asa (o con el teclado: Espacio
para cogerla, flechas para moverla, Espacio para soltarla). Está explicado en
[«Buenas referencias»](buenas-referencias.md).

Desde la 0.14.0 no hace falta acertar a ciegas: la ficha del personaje tiene un panel de **vistas** que dice
cuál falta, un visor que te guía al hacer cada foto y un control de calidad que rechaza lo que no va a servir
diciendo por qué. Está todo en [«Buenas referencias»](buenas-referencias.md). Una foto repetida no se puede
añadir. Una foto pequeña (por debajo de 512 px de lado menor por defecto) **sí**: se avisa de que va a guiar algo
peor el parecido y se puede usar de todas formas, también al elegirla de tu biblioteca.

## 3. Registra el consentimiento

El consentimiento se rellena en una **zona de claridad**: fondo neutro, sin animación y con el texto legal
delante. Hay tres casos:

| ¿De quién es la imagen? | Qué hace falta | En qué queda el personaje |
|---|---|---|
| **Soy yo** | Tu declaración, que queda guardada con tu cuenta y la fecha | Listo, en cuanto tenga las fotos mínimas |
| **Un animal mío** | Tu declaración | Listo, igual |
| **Otra persona** | El **documento de consentimiento firmado** por ella, subido desde tu equipo en JPEG o PNG | **En revisión**: no genera hasta que quien administra la instalación acepte el documento |

Además, en los tres casos hay que **declarar que la persona de las fotos es mayor de edad**. Sin esa
declaración no se registra nada.

> **Lo que este control no garantiza.** Escenara no comprueba identidades ni edades: no existe ninguna
> detección de edad fiable. Lo que hace es guardar tu declaración con tu cuenta y la fecha, exigir un documento
> firmado para la imagen de terceros y pasarlo por una revisión humana. Es un control, no una verificación, y
> responder en falso es tu responsabilidad. Está explicado en
> [Cumplimiento y privacidad](../legal/cumplimiento-y-privacidad.md).

El uso **comercial** se declara aparte del personal a propósito: usar la imagen de alguien para promocionar o
vender algo necesita que esa persona lo autorice expresamente.

## 4. Genera con él

En **Crear**, el primer paso es elegir a quién generas. Los personajes que todavía no se pueden usar salen
deshabilitados con el motivo delante. La imagen suelta sigue disponible: elige **«Sin personaje»**.

Al elegir un personaje hay que confirmar una cosa más: que en sus fotos **no aparece ninguna otra persona ni
ningún menor**. Es el aviso previo al envío, porque las referencias se suben al almacenamiento temporal del
proveedor, donde quedan accesibles por enlace unas horas.

Escenara manda tantas fotos del personaje como admita el modelo elegido (el catálogo lo dice: el modelo de
imagen predeterminado admite hasta 10). Si el modelo que eliges no acepta fotos de referencia, te lo dice y no
envía nada.

## 5. Revocar el consentimiento

Desde la ficha del personaje, **Revocar el consentimiento** lo **bloquea al momento**: no se puede volver a
generar con él, y **los trabajos que estuvieran esperando en la cola tampoco saldrán**: se cierran sin coste y
el presupuesto que tenían reservado vuelve a estar disponible. Lo que ya se generó **se conserva**; si quieres
que desaparezca, borra el personaje.

Si un personaje se registró alguna vez como imagen de otra persona, sigue siéndolo: no se puede cambiar a «soy
yo» ni a «un animal mío». Para volver a usarlo hay que registrar otro consentimiento de tercero, con su
documento, y esperar la revisión.

El registro revocado no se borra: es la prueba de qué se declaró y cuándo. Registrar un consentimiento nuevo
revoca el anterior y desbloquea el personaje.

## 6. Borrar un personaje

Borrar un personaje **se lleva por delante los vídeos y fotogramas hechos con él**, también del
almacenamiento. El diálogo enumera exactamente qué se va a borrar antes de pedir la confirmación:

- el personaje y su registro de consentimiento;
- sus relaciones con las fotos de tu biblioteca — **las fotos no se borran**, siguen ahí;
- los archivos **generados** con él y sus trabajos del historial. Esto no se puede deshacer.

El documento de consentimiento firmado se queda en tu biblioteca, para que decidas tú cuándo borrarlo.

**Si tiene trabajos en marcha, no se puede borrar todavía.** Un trabajo que ya está en el proveedor se va a
cobrar y su resultado va a llegar, así que hay que esperar a que termine; el diálogo te lo dice. Los que aún no
han salido se cancelan solos al borrar, y su presupuesto reservado vuelve a estar disponible. Si lo que quieres
es dejar de generar con él ya mismo, revoca su consentimiento: eso es inmediato.

## Preguntas que surgen

**¿Puedo usar la misma foto en dos personajes?** Sí. Una foto de tu biblioteca puede ser referencia de varios.

**Intento borrar una foto para siempre y me avisa.** Es porque se usa como referencia de algún personaje (o es
el documento de un consentimiento). El aviso dice a cuáles afecta; si sigues adelante, esos personajes pierden
esa referencia y puede que se queden por debajo del mínimo y dejen de poder generar hasta que añadas otra.

**Mi personaje está «en revisión» desde hace rato.** Su consentimiento es de otra persona y espera a que quien
administra la instalación mire el documento en **Admin › Personajes**. Si lo rechaza, verás la nota con el
motivo en la ficha.

**¿Quién ve mis fotos y el documento firmado?** Las fotos, **solo tú**: no se le muestran a nadie más, ni a
quien administra la instalación. Del documento de consentimiento de un tercero, quien administra ve **solo ese
documento**, para poder revisarlo, y cada vez que lo abre queda registrado con su cuenta y la fecha. Todos los
archivos se sirven con enlaces temporales que caducan.

**El documento se ve borroso o recortado.** No debería: los documentos se guardan tal cual, sin reducir ni
reconvertir, precisamente para que la letra pequeña siga siendo legible. Súbelo con «Documento de consentimiento
firmado» y no como una foto más. Ese campo solo admite subida desde tu equipo, en **JPEG o PNG**: no se puede
elegir de la biblioteca ni traer por URL, porque entonces sería una imagen normal (ya recortada) y una foto del
propio personaje podría acabar haciendo de documento, lo que no prueba nada. Al guardarlo se le quitan los datos
EXIF, **incluida la localización** de donde se hizo la foto, sin tocar la imagen.

**No me deja borrar el documento.** Mientras el consentimiento esté vigente, no: es la prueba que sostiene al
personaje. Revoca primero su consentimiento y después ya podrás borrarlo.

**Mandé una foto del personaje a la papelera y ahora no puede generar.** Es lo esperado: una foto en la papelera
no se puede enviar a ningún proveedor, así que no cuenta para el mínimo. Restáurala y el personaje vuelve a estar
listo sin tener que añadirla otra vez.

## Qué sale de Escenara cuando generas con él (0.17.0)

No son solo sus fotos. **El texto de su ficha** —rasgos, estilo, vestuario, personalidad y descripción— forma parte
del prompt, así que **se procesa en KIE** igual que las fotos. Y si tu instalación traduce los prompts al inglés,
ese texto pasa **además** por el modelo de texto de KIE, y su traducción se guarda con tu cuenta.

Dos cosas que van con eso:

- lo dice el propio formulario de consentimiento, antes de registrarlo;
- **al borrar el personaje se borran también sus traducciones**, en la misma operación que sus derivados y su
  consentimiento. Y las que nadie use durante mucho tiempo se borran solas.
