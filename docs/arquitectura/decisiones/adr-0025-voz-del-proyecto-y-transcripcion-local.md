# ADR-0025 · La voz se elige por proyecto, se genera con el proveedor del catálogo y la transcripción es local

- **Estado:** propuesto (decisión firme del propietario sobre el modo de voz; proveedor, transcriptor y música son decisiones provisionales del 2026-09-28, pendientes de confirmar)
- **Fecha:** 2026-09-28
- **Versión del proyecto:** 0.21.0

## Contexto

Desde la 0.19.0 un proyecto se produce escena a escena y el modelo de vídeo puede poner el diálogo en boca del
personaje con los labios sincronizados. Eso ya es una voz, y funciona. El problema que abre la 0.21.0 no es «cómo
hacer que hable», sino **que suene igual de una escena a otra**: el brainstorm §3.2 señaló que dos clips generados
por separado pueden salir con timbres distintos aunque el personaje sea el mismo, y un vídeo en el que la voz
cambia de plano a plano no se puede publicar.

Hay además tres piezas que dependen de esa decisión y que no se pueden decidir antes que ella:

- los **subtítulos** salen de algún audio, y cuál es ese audio depende de dónde viva la voz;
- la **transcripción** puede ser local o de pago, y eso cambia si hay que registrar un gasto o no;
- la **música** de fondo puede subirse o generarse, y eso cambia quién responde de sus derechos.

Y lo que ya estaba decidido y no se toca: se paga con la clave del propio usuario (ADR-0009), sin precio registrado
no se estima ni se gasta (ADR-0015), todo gasto pasa por la misma cola con su reserva y su conciliación (ADR-0016)
y por el motor de controles previos (ADR-0023), y la configuración de la instalación vive en el panel de
administración, no en `.env` (ADR-0013).

## Opciones

### Dónde vive la voz

1. **Siempre dentro del clip.** Es lo que ya funciona y no añade ningún gasto nuevo. Falla en cuanto el proyecto
   tiene varias escenas con diálogo: el timbre puede cambiar entre ellas y no hay forma de fijarlo.
2. **Siempre en una pista aparte.** Resuelve el timbre, pero pierde la sincronía labial y **cobra una llamada por
   escena** a proyectos que hoy no pagan nada por su voz. Además rompería los proyectos que ya existen.
3. **Un modo por proyecto, con los dos excluyentes.** Cada proyecto elige, y lo elegido vale para todas sus
   escenas. Cuesta una decisión más al usuario y obliga a invalidar lo generado cuando cambia.

### Quién genera la voz

1. **KIE**, que en su «market» revende modelos de voz de ElevenLabs por el mismo `jobs/createTask` asíncrono que el
   vídeo y **con la misma credencial** del usuario.
2. **ElevenLabs directamente**, con una segunda credencial del usuario en la bóveda.

### Quién transcribe

1. **`whisper.cpp` en la máquina**, sin clave y sin coste, como dependencia del entorno igual que FFmpeg.
2. **Un proveedor de pago**, con su estimación, su confirmación y su apunte en el registro de gasto.

## Decisión

**El modo de voz se elige por proyecto y es excluyente** (decisión firme del propietario, opción 3):

- `clip` (de fábrica): el modelo de vídeo dice el diálogo con los labios sincronizados. No hay pista aparte y los
  subtítulos salen de transcribir el audio del clip. Es exactamente lo que hacía la 0.19.0, así que ningún proyecto
  existente cambia de comportamiento;
- `pista`: los clips se piden **sin diálogo**, solo con sonido ambiente, y el diálogo se genera aparte escena a
  escena con **la misma voz y los mismos parámetros** fijados en el proyecto.

**Una escena no puede tener su propia voz**, y el servidor no ofrece ninguna forma de intentarlo: la petición que lo
intente se rechaza con su motivo. Es la regla que hace que el timbre no cambie de plano a plano, y una regla que
solo viviera en la interfaz no sería una regla.

**Cambiar el modo, la voz, cualquiera de sus parámetros o el diálogo de una escena invalida lo que dependía de
ello.** La invalidación se decide comparando una **firma** guardada con la vigente, no con una bandera que pueda
desincronizarse. Invalidar es **marcar, no borrar**: el audio ya está pagado y sigue en la biblioteca de su dueño.
Un cambio que deje sin valer escenas ya generadas **exige confirmación** diciendo cuántas son, y **no regenera
nada**: cada escena se regenera a mano confirmando su coste.

**La voz la genera el proveedor del catálogo** (opción 1): `elevenlabs/text-to-speech-multilingual-v2` en el
«market» de KIE, con la misma credencial de KIE del usuario, así que no hace falta una segunda clave ni una fila
nueva en la bóveda. Entra en el catálogo **sin precio registrado**, porque KIE no publica su tarifa: sin precio no
se estima y no se gasta, la pantalla lo dice y no ofrece generar hasta que quien administra lo mida una vez y
registre el precio medido. Sin clonación de voz en esta versión.

**La transcripción es local** (opción 1): el binario de `whisper.cpp`, configurado en Admin › Ajustes. Es una
dependencia del entorno, igual que FFmpeg desde la 0.20.0: si falta, se dice con su mensaje de instalación y **no se
inventan subtítulos**. No sale nada de la máquina, así que **no deja ningún apunte de gasto externo**.

**La música solo se sube**, con declaración de derechos escrita que exige el servidor y que se guarda con su fecha.
No se genera música en esta versión.

## Consecuencias

- **Se gana** una voz coherente en todo el proyecto sin cobrarle nada nuevo a quien no la necesita: el modo de
  fábrica es el que ya funcionaba.
- **Se gana** un único camino de dinero: la pista de voz pasa por la misma cola, la misma reserva, la misma
  idempotencia y el mismo motor de controles que un fotograma o un clip. No hay ninguna regla repetida.
- **Se pierde** la sincronía labial en modo `pista`: el clip no mueve los labios con lo que dice el audio. Es el
  precio de fijar el timbre, y está fuera del alcance de esta versión.
- **Se pierde** poder ajustar la voz de una escena concreta. Es deliberado.
- **Habrá que revisar** el proveedor de voz en cuanto se mida su precio con dinero real: si la tarifa resulta
  inasumible, la alternativa es ElevenLabs con credencial propia del usuario, y el contrato de adaptadores ya la
  admite sin tocar nada de la pantalla.
- **Habrá que revisar** el transcriptor cuando se mida su tiempo en el servidor del piloto (0.33.0): el modelo
  pequeño es el de fábrica precisamente porque cabe en un servidor modesto.
