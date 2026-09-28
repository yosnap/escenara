# ADR-0025 · La voz se elige por proyecto, se genera con el proveedor del catálogo y la transcripción es local

- **Estado:** propuesto (firmes: el modo de voz y el cambio automático de proveedor; provisionales y pendientes de confirmar: transcriptor y música)
- **Actualizado:** 2026-09-28 con el addendum de ElevenLabs directo
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

## Addendum · 2026-09-28 · ElevenLabs directo como proveedor de reserva, con cambio automático

La decisión 1 se tomó sobre la promesa de que el «market» de KIE serviría el modelo de voz. **No lo ha hecho**: el
2026-09-28, con la clave del propietario, `jobs/createTask` devolvió *Internal Error* (500) sin cobrar en
`elevenlabs/text-to-speech-multilingual-v2` y también en `turbo-2-5`, con los campos correctamente envueltos bajo
`input`; el modelo de texto `gpt-5-6-sol` del mismo proveedor tampoco respondió (120 s). Es KIE degradado, no un
problema de la forma del cuerpo.

La misma tarde, la API de ElevenLabs respondió a la primera: 200 en 2,5 s, con el audio y las marcas por carácter.

**Se añade ElevenLabs como proveedor de voz con credencial propia del usuario**, y el cambio entre los dos es
**automático** (decisión firme del propietario, 2026-09-28). El proyecto no elige proveedor: elige voz. Y las voces
son las mismas, porque se guardan por su identificador de ElevenLabs.

Tres reglas gobiernan el cambio, y las tres son de dinero:

1. **Solo se cambia cuando se puede probar que el primero no cobró.** Se reutiliza la lista blanca de rechazos
   probados de la 0.12.0 (`ErrorProveedor.rechazoProbado`: credencial rechazada, sin saldo, exceso de ritmo,
   formato). Un 5xx, un tiempo agotado o una respuesta que no se entiende **no** prueban nada: ahí el trabajo
   queda `desconocido` con su reserva retenida y **no se reenvía a nadie**, exactamente como antes.
2. **Cada proveedor se estima en su propia moneda, y por carácter.** Los créditos de KIE y los del plan de
   ElevenLabs no son la misma unidad, así que no se comparan con `max` ni se suman (primer diseño, descartado en
   revisión). Se confirma y se aparta el coste del proveedor elegido; el del proveedor de reserva se enseña al
   usuario junto al primero y se guarda en la entrada del trabajo al encolar (`input.reserva`: proveedor, modelo
   y créditos). Como los modelos de voz cobran por carácter, las dos cifras escalan con la longitud del diálogo
   (`lib/voz.ts › creditosDeVoz`, regla de tres sobre el precio medido) y no con una tarifa plana.
3. **El relevo solo va a lo autorizado.** Solo procede si la alternativa es el mismo proveedor y modelo guardados
   al encolar y si lo que cuesta ahora cabe en esa cifra; si no (la clave se añadió después, cambió el modelo o
   subió el precio), no se cambia y el mensaje dice qué se podía haber probado y por qué no. Se descartó
   reconfirmar a mitad de envío: dejaba al usuario con el primer proveedor fallado y un trabajo esperando un clic.
4. **El registro de gasto dice la verdad sobre quién cobró.** Al cambiar, la reserva pasa a nombre del proveedor
   nuevo y a su importe autorizado, y el consumo se apunta con lo que informa la cabecera `character-cost` de la
   respuesta, no con la estimación. Queda pendiente del propietario: el valor en euros del presupuesto usa un
   único `eurosPorCredito` de la instalación, pensado para KIE; los créditos de ElevenLabs necesitarían su propia
   equivalencia.

**El proveedor de reserva es síncrono**, lo que obliga a una pieza nueva en el contrato de adaptadores: `generarVoz`
devuelve el identificador y, si el proveedor ya tiene el resultado, también el audio. Quien despacha lo cierra en la
misma pasada por el camino de cierre de siempre. Consultar a ElevenLabs devuelve `desconocido` a propósito: si eso
se alcanza es que el proceso se cayó entre pagar y guardar, y volver a llamar sería pagar dos veces.

**Las marcas por carácter que devuelve el proveedor se usan para los subtítulos**: son medidas sobre el audio que
acaba de generar, así que valen más que repartir el tiempo entre las frases a ojo. Se guardan como transcripción y
proponen los subtítulos solo si nadie los ha corregido a mano.

**Norma nueva sobre los mensajes de error** (propietario, 2026-09-28): un fallo de voz dice **qué** falló
(proveedor, modelo y causa concreta), **si se ha cobrado o no**, **qué se intentó** (los dos proveedores, si hubo
dos) y **qué puede hacer** quien lo lee. «No se ha podido, vuelve a intentarlo» queda prohibido. Lo que nunca sale:
el texto literal del proveedor, rutas del servidor ni la configuración de la máquina. Vive en `lib/diagnostico-voz.ts`.

**Migración 0024**: `credential_provider` gana el valor `elevenlabs`. El mismo enum lo usan la bóveda, los apuntes
de gasto, los trabajos, los precios y las muestras, así que un solo valor cubre los cinco.

## Consecuencias

- **Se gana** una voz coherente en todo el proyecto sin cobrarle nada nuevo a quien no la necesita: el modo de
  fábrica es el que ya funcionaba.
- **Se gana** un único camino de dinero: la pista de voz pasa por la misma cola, la misma reserva, la misma
  idempotencia y el mismo motor de controles que un fotograma o un clip. No hay ninguna regla repetida.
- **Se pierde** la sincronía labial en modo `pista`: el clip no mueve los labios con lo que dice el audio. Es el
  precio de fijar el timbre, y está fuera del alcance de esta versión.
- **Se pierde** poder ajustar la voz de una escena concreta. Es deliberado.
- **Ya se revisó** el proveedor de voz: KIE no sirvió el modelo y ElevenLabs entró como reserva con cambio
  automático (ver el addendum). El contrato de adaptadores lo admitió con una sola pieza nueva, la del resultado
  inmediato, y la pantalla no cambió de forma.
- **Se gana** que una avería de un proveedor no deje el proyecto parado, y **se pierde** la certeza de en qué
  cuenta se va a pagar antes de pulsar: por eso la pantalla dice con cuál se intentará, con cuál se cambiaría, y
  después con cuál se generó de verdad.
- **Habrá que revisar** el transcriptor cuando se mida su tiempo en el servidor del piloto (0.33.0): el modelo
  pequeño es el de fábrica precisamente porque cabe en un servidor modesto.
