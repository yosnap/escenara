# Revisar la continuidad de tus escenas

Cuando una escena ya tiene su clip, queda lo más importante y lo único que no puede hacer una máquina: **mirarlo**.
Esta guía explica qué comprueba Escenara por ti, qué no comprueba, y cómo se decide que una escena vale.

La pantalla está en **Proyectos → tu proyecto → Producción → Revisar la continuidad**
(`/proyectos/<id>/revision`). Solo la ve el dueño del proyecto: quien administra la instalación no revisa contenido
ajeno.

## Qué ves de cada escena

Tres cosas, una al lado de la otra, para que puedas compararlas sin cambiar de pantalla:

1. **El clip generado**: lo que se va a montar.
2. **El fotograma aprobado**: el fotograma que diste por bueno y del que salió el clip.
3. **La hoja de personaje**: la referencia de identidad de la versión con la que se generó esa escena (cara, pelo,
   ropa, complexión).

Los tres paneles comparten el **zoom**, con botones de 1×, 2× y 3×: ampliar solo uno haría comparar dos cosas a
escalas distintas. Con el zoom puesto, cada panel se recorre con el tabulador y las flechas, sin ratón.

## La comprobación automática: qué mide y qué no

El botón **«Comprobar el clip»** mide el archivo con FFmpeg. **No cuesta ni un crédito**: se lee el clip que ya está
en tu biblioteca, no se llama a ningún proveedor y no sale nada de tu servidor.

Se comprueban seis cosas, y de cada una se te dice **el valor medido y el que se pedía**:

| Comprobación | Qué mide | Si falla |
|---|---|---|
| El archivo se puede leer | Que sea un vídeo con pista de imagen | **Crítico** |
| Duración | Los segundos reales frente a los que pedía la escena | **Crítico** |
| Resolución | El lado menor real frente al que se pidió | **Crítico** |
| Proporción | La proporción real frente a la que se pidió | **Crítico** |
| Audio | Si el clip lleva pista de audio | Aviso |
| Tramos negros o congelados | Segundos de metraje plano | Aviso |

Cuando algo **no se puede medir** (el archivo no informa de su duración, el análisis no se puede hacer), se dice
exactamente eso: «no se ha podido medir». **No medir no es aprobar**, así que cuenta como aviso y nunca pinta un
visto.

### Lo que la comprobación automática NO garantiza

Esto es lo más importante de esta guía:

> La comprobación automática **solo mide el archivo**: que se pueda leer, cuánto dura, cómo es de grande, si lleva
> audio y si hay tramos negros o congelados. **No comprueba que el personaje sea el mismo**, ni que la escena cuente
> lo que querías, ni que encaje con la escena anterior. Eso lo decides tú mirando el clip junto a la hoja de
> personaje.

Un panel con seis vistos verdes significa «el archivo está bien hecho». No significa «esta escena vale». Por eso
Escenara nunca da por revisada una escena solo porque sus comprobaciones técnicas pasen: mientras falte tu decisión,
lo dice.

## Tu decisión: aceptar, rechazar o marcar como crítico

- **Aceptar la escena**: la has mirado y la das por buena. No cuesta nada y no genera nada; solo deja constancia.
- **Rechazar con motivo**: no vale. Queda apuntado con lo que escribas, **avisa** pero no bloquea nada: puedes
  regenerar la escena cuando quieras.
- **Marcar como crítico**: no vale **y no se exporta** el proyecto hasta que se resuelva.

Rechazar y marcar como crítico **exigen motivo** (al menos diez caracteres). No es burocracia: dentro de dos semanas,
«no me gusta» no le dice a nadie qué había que arreglar.

## Qué bloquea la exportación

Una escena bloquea la exportación del proyecto cuando mantiene un **fallo crítico abierto**. Hay dos clases, y se
resuelven de forma distinta:

- **Un crítico técnico** (el clip no se lee, dura otra cosa, tiene otra proporción o otra resolución). **No se cierra
  aceptándolo**, porque no es una cuestión de gusto: un clip que dura 1 s no deja de durarlo porque tú lo apruebes. Se
  resuelve **regenerando la escena**.
- **Un crítico que marcaste tú**. Se cierra con tu propia decisión posterior: vuelves a mirar la escena y la
  **aceptas**. Siempre hay salida.

La pantalla enumera, arriba, **qué escenas bloquean y por qué**, con la misma información que usará la puerta de la
exportación. No puede decirte una cosa y la exportación otra.

## Cuándo deja de valer una revisión

Una revisión revisa **un clip concreto generado con una versión concreta del personaje**. Deja de valer sola en dos
casos:

- **regeneras la escena**: lo que revisaste ya no es el clip que hay;
- **creas una versión nueva del personaje protagonista**: la referencia con la que se comparó la identidad ha
  cambiado.

En los dos casos la revisión **no se borra**: se marca como «ya no vale», con su motivo y su fecha, y queda en el
historial de la escena. Así, meses después, se puede responder qué se dio por bueno, cuándo y por qué dejó de valer.

## La revisión con modelo (opcional y de pago)

Además de lo anterior, Escenara puede pedirle a un modelo que **mire** el clip y describa lo que ve. Tres cosas que
conviene tener claras:

- **cuesta créditos** de tu cuenta del proveedor, así que se pide escena a escena, con su estimación delante y
  confirmándola. **Nunca se lanza sola**: no hay ningún camino que la dispare al terminar una escena, al abrir la
  pantalla ni al refrescar;
- **es una opinión, no un veredicto**. Su resultado se muestra al lado del tuyo; no acepta ni rechaza nada y no abre
  ningún crítico. La identidad la validas tú;
- viene **apagada de fábrica**, y quien administra la instalación decide si se ofrece (Admin → Ajustes → Revisión de
  continuidad).

Cada revisión con modelo queda en tu registro de gasto con su reserva, su consumo y su liberación, como cualquier
otro gasto. Y **no se paga dos veces**: si pulsas dos veces, o si el navegador reintenta porque se cortó la conexión,
se te devuelve la revisión que ya se pidió en lugar de encargar otra.

## Requisito del servidor: FFmpeg

Las comprobaciones técnicas necesitan **`ffprobe` y `ffmpeg`** instalados en la máquina que ejecuta Escenara. Si
faltan, la revisión te lo dice con su mensaje y **no muestra ningún resultado**: un panel en verde por no tener
FFmpeg sería peor que no comprobar nada.

- Debian o Ubuntu: `apt-get install ffmpeg`
- macOS: `brew install ffmpeg`

## Qué puede ajustar quien administra

En **Admin → Ajustes → Revisión de continuidad**:

- la **tolerancia de duración** en segundos (medio segundo de fábrica: un MP4 de 4 s mide 4,0–4,1 s según cómo se
  cierre el contenedor, y eso no es un formato incorrecto);
- los **segundos negros o congelados** que se toleran antes de avisar;
- si se **exige audio** (apagado de fábrica: no todos los modelos de animación generan voz);
- si se **ofrece la revisión con modelo** (apagada de fábrica).

Lo que **no** se ajusta desde el panel es qué fallo es crítico: eso es una decisión de producto y vive en el código,
donde se revisa como código.
