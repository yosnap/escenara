# ADR-0031 · Composición del prompt dirigido: el orden vive en el código

- **Estado**: aceptada y **medida** en dos spikes (2026-09-28). Solo el acento queda por juzgar de oído
- **Fecha**: 2026-09-28
- **Versión**: 0.25.0
- **Relacionadas**: ADR-0022 (el prompt lo compone el servidor y no sale hacia el navegador), ADR-0024
  (reintentos de lo que pudo cobrarse), ADR-0028 (escenas habladas con identidad registrada), ADR-0030
  (coherencia: percibir, decidir, registrar)

## Contexto

Hasta la 0.24.x la dirección del clip estaba **cableada**. La plantilla sembrada `clip-social` terminaba con
`Camera: steady, with a subtle handheld feel.`, la misma frase para todos los clips de todos los proyectos de
todas las instalaciones, y la escena se reducía a dos campos: `script_text` (lo que dice) y `action` (lo que se
ve). No había forma de pedir un contrapicado, ni un acercamiento lento, ni que el gesto ocurriera **antes** de
la frase en lugar de después.

Dirigir de verdad obliga a resolver tres cosas que la plantilla plana de la 0.16.0 no sabe hacer:

1. **El orden depende de lo elegido.** La micro-acción va delante del diálogo si el usuario pidió «antes» y
   detrás si pidió «mientras» o «después». Una plantilla con huecos fijos no puede mover un hueco de sitio.
2. **Hay partes que desaparecen.** En formato voz en off no hay diálogo, ni voz, ni acento: hay una frase que
   dice expresamente que el personaje no habla. No es un hueco vacío, es otro bloque.
3. **Hay partes que no se negocian.** La regla de toma única y el bloque de anclajes de realismo tienen que
   estar **siempre**, incluso si quien administra vacía el catálogo y aunque el usuario no elija nada.

Y un cuarto asunto, medido y no teórico: los modelos de vídeo leen el prompt como un guion técnico y respetan
mejor lo que va antes. La guía de cinematografía de Veo pone la cámara primero; la de Kling insiste en un solo
movimiento por plano. El orden no es cosmética: es la parte de la petición que más cambia el resultado.

## Opciones

### A. Todo en la plantilla, con condicionales

Añadir sintaxis de condicionales y bucles a las plantillas de `presets.json` para que el orden y las partes
opcionales se expresen allí.

- **Supuesto**: quien administra quiere y sabe editar el orden del prompt.
- **Dónde falla primero**: convierte la plantilla en un lenguaje de programación con su propio intérprete, su
  propio validador y sus propios errores, mantenido por nosotros. Y el primer error de sintaxis de un admin se
  paga con generaciones que salen mal, no con un mensaje de compilación.

### B. Todo en el código, sin catálogo

Componer el prompt entero en TypeScript, con los textos en inglés dentro del propio compositor.

- **Supuesto**: el catálogo de planos, gestos y luces es estable.
- **Dónde falla primero**: no lo es. Añadir un gesto o afinar la redacción de un movimiento pasaría a ser un
  despliegue, cuando la 0.16.0 existe precisamente para que no lo sea.

### C. El orden en el código, los textos en el catálogo *(elegida)*

El **esqueleto y el orden** viven en `server/direccion/` como funciones puras. Los **fragmentos en inglés** de
cada opción viven en los presets y los edita quien administra sin desplegar nada.

## Decisión

**El orden del prompt dirigido es código, con este ADR como su documentación.** Quien administra edita qué dice
cada opción, no en qué posición entra.

El compositor del clip (`server/direccion/clip.ts`) emite, en este orden:

1. **encuadre y cámara** — formato, plano, ángulo, movimiento y registro estético;
2. **sujeto y escena** — quién sale y dónde;
3. **micro-acción `antes`**, si el gesto se pidió antes de hablar;
4. **guion** — el diálogo literal, entre comillas y **sin traducir nunca**;
5. **micro-acción `durante` o `despues`**;
6. **voz y acento** — los cinco ejes del personaje y la variedad de español del proyecto;
7. **regla de toma única** — siempre la última, se haya elegido movimiento o no.

El compositor del fotograma (`server/direccion/fotograma.ts`) emite las **6C**: personaje, cámara, ropa,
contexto, luz y anclajes de realismo, y **C6 cierra siempre**.

Tres reglas que este ADR fija y que no dependen de ninguna configuración:

- **la regla de toma única va siempre**, aunque la cámara se quede quieta: un plano fijo también se puede
  partir;
- **el bloque de anclajes (C6) va siempre**, y si el catálogo estuviera vacío se usa el del código. El usuario
  no lo elige y no lo puede quitar; quien administra sí lo compone;
- **con una persona real no entra ningún adjetivo de atractivo**, lo pida quien lo pida, y **ningún rasgo suyo
  se exagera**: las pecas, los lunares, las cicatrices, el tono de piel y el bronceado que nombre su ficha
  describen cómo es ya, no son un efecto que aplicar, y con una escena de playa el modelo los subía solo. Con
  un personaje inventado el atractivo solo entra si el usuario lo eligió expresamente.

**Dónde se aplica.** Después de traducir y después de todas las puertas gratis, en
`generacion/servicio.ts` y en `omni/escena.ts`: el hueco del texto libre se rellena con el texto del usuario ya
en inglés, y el diálogo se deja intacto porque es lo que se va a oír. La dirección la resuelve el **servidor**
desde la fila de la escena (`server/direccion/escena.ts`); no viaja en la petición, porque si viajara el
navegador podría mandar texto suyo al proveedor saltándose el catálogo.

**Qué familia coloca el diálogo.** Omni lo pone con `saying in Spanish: "…"` y Veo al principio con dos puntos,
las dos formas medidas con dinero real. Para esas familias el compositor **no** lo escribe dentro del texto;
para las demás sí, porque su entrada no tiene un hueco aparte donde ponerlo.

## Consecuencias

**Qué se gana.** El orden se prueba entero sin base de datos, sin proveedor y sin gastar un crédito: los
compositores son funciones puras y la batería comprueba el orden, la regla de toma única, el modo mudo, el
momento del gesto y las comillas del diálogo. Quien administra sigue pudiendo cambiar qué dice cada opción sin
desplegar. Y el prompt sigue sin salir hacia el navegador de un usuario normal (ADR-0022): lo que él ve es su
elección escrita en castellano.

**Qué se pierde.** Cambiar el orden exige una versión nueva, no un formulario. Se acepta a sabiendas: el orden
es una propiedad medida del modelo, no una preferencia, y cambiarlo sin medirlo empeoraría el resultado sin que
nadie supiera por qué.

**Qué dijo el spike (2026-09-28, 504 créditos, cinco clips utilizables).** El orden **no queda contradicho**:
con la cámara primero, el acercamiento lento se respetó y el encuadre, el ángulo, el sitio y el registro
salieron como se pidieron. Y lo más importante: **ninguno de los cinco clips tiene un corte**, que era el
riesgo alto de la fase. La regla de toma única se queda como está.

Lo que el spike **no** pudo confirmar es el momento del gesto, y por un motivo que no es del modelo: en un clip
de 4 s una frase normal ocupa el clip entero y no deja hueco para asentir antes ni después. De ahí sale una
regla nueva, que es aritmética y no opinión: cuando la frase no deja hueco, el gesto se coloca **dentro** del
habla y se avisa (`lib/direccion.ts › gestoNoCabe`). Prometer un «antes» que no cabe sería prometer algo que no
puede ocurrir.

**Qué dijo el segundo spike (clips de 8 s, 315 créditos de los 504 aprobados).** Cierra lo que faltaba, y con
un resultado que obliga a matizar el orden:

- **el momento del gesto no es dirigible hacia atrás.** Con hueco de sobra, el modelo empieza a hablar en el
  primer fotograma y deja el silencio al final: «después» se cumple porque coincide con ese hueco, y «antes»
  no se cumple casi nunca. El orden del prompt **se mantiene** —es lo que el usuario pidió y no hace daño—,
  pero el producto **avisa** en vez de prometerlo. Dirigir es ofrecer lo que el modelo puede dar y decir la
  verdad sobre el resto;
- **un movimiento avanzado sí se respeta**: el push-in a los ojos salió continuo y sin corte, así que baja a
  «con variación» en el catálogo. Los demás avanzados siguen sin medir;
- **prohibir el audio rompe el clip mudo.** El proveedor falló sin cobrar con «no voice of any kind». El
  producto vuelve a la regla que ya conocía desde la 0.19.0: describir el ambiente en positivo y limitarse a
  decir, en lo visual, que la boca está cerrada. Es la lección más barata de las dos tandas y la que más cerca
  estuvo de llegar al usuario.

**Qué habrá que revisar.** El **acento** sigue sin juzgar: hay audio en los clips, pero eso se decide de oído.
Los movimientos avanzados que no se han medido siguen marcados como tales. Y `direccion_fiel` mide en sombra
cuánto se respeta la dirección, que es lo que dirá si alguno hay que retirarlo del catálogo.
