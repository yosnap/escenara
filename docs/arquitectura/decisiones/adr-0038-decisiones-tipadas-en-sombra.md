# ADR-0038 · Decisiones registradas con evidencia y evaluación tipada en sombra

- **Estado:** Aceptada para 0.39.0; las dos preguntas y el uso de la clave del operador son decisiones por defecto
  pendientes de revisión del propietario.
- **Versión:** 0.39.0
- **Fecha:** 2026-09-30

## Contexto

El motor de controles (ADR-0023) ya guardaba cada evaluación de la puerta de envío con su estado, sus reglas y su
versión, pero no **qué se miró** ni **con qué umbrales**, y había puntos de decisión que no dejaban rastro: el tope
del proyecto ante el asistente de guion, la puerta previa del canto y la reevaluación del despacho antes de subir una
cara al proveedor. (La puerta parcial `exigirEscenaAprobada` también registra si se llama, pero hoy no la llama
ningún camino de producción: producir una escena pasa por la puerta completa.) La coherencia (ADR-0030) ya hablaba con Jev en
modo sombra, pero solo cuando alguien lo pedía desde la revisión y sin relación con las decisiones del motor.

El PRD (§9) pide medir antes de automatizar: la confianza de un modelo de decisión describe la forma de su
distribución, no cuántas veces acierta, y no existe una frontera universal (0,8 o 0,9) que valga para todas las
preguntas.

## Opciones

1. Tabla nueva de decisiones que duplique la de evaluaciones del motor y la de coherencia. Tres registros de lo
   mismo que se desincronizan.
2. Ampliar la evaluación del motor con evidencia, umbrales, puerta y acción, registrar **todos** los puntos, y
   guardar la opinión de la sombra en una tabla propia enlazada a cada decisión.
3. Dejar que Jev decida directamente en la puerta con un umbral fijo. Automatiza sin datos de acierto y mete una
   llamada de red en el camino crítico de cada envío.

## Decisión

Se elige la segunda opción.

- **Las reglas mandan.** La decisión efectiva es siempre la del motor determinista. Toda evaluación del motor pasa
  por la puerta (`controles/puerta.ts`), que la guarda con su evidencia (los hechos sin nombres de personas ni
  texto de nadie: los nombres del personaje, del reparto y del producto se sustituyen por marcadores en los motivos
  y en la evidencia al escribir, se vuelven a quitar al leer y la migración los quita de las filas anteriores), los
  parámetros como umbrales, la versión de reglas, la puerta (`envio` o `frenos`) y la acción
  (`permite`, `pide-confirmacion`, `rechaza`). Un candado de código comprueba que el motor no se llama desde
  ningún otro sitio que decida.
- **La sombra no bloquea.** Tras una decisión de la puerta de envío sobre una escena, Jev evalúa en paralelo la
  pregunta «¿el guion contiene una afirmación que exige verificación?» (`noul`). La puerta no la espera; un
  fallo, un error o un tiempo agotado (10 s) se guardan como fallo, nunca como opinión, y no cambian nada. Dentro de
  una petición se alarga con `after()` de Next; fuera (worker, tests) queda registrada para esperarla. Con la
  sombra apagada no se lee la clave ni se llama a nadie. El mismo texto no se paga dos veces y hay un tope diario
  por usuario que se cuenta de forma atómica.
- **Sin personas reales y sin nombres.** Una escena con un personaje real (protagonista o reparto, con o sin
  consentimiento) no se evalúa: su consentimiento cubre generar con los proveedores del usuario, no una medición
  del operador. En las demás, los nombres de los personajes y del producto se sustituyen por marcadores antes de
  enviar. Solo se envía texto.
- **La segunda pregunta se reutiliza.** «¿La escena generada corresponde a la descripción?» es la comprobación
  `resultado` de la coherencia: necesita percibir el clip, así que sigue pidiéndose desde la revisión y su
  registro es el de siempre.
- **Umbrales por pregunta, sin frontera universal.** Cada pregunta tiene su umbral en Admin › Ajustes; por debajo,
  la opinión cuenta como «no opina». El umbral solo ordena la medición: no automatiza nada.
- **La etiqueta humana se deriva, no se copia, y es la de cada pregunta.** La de las afirmaciones es lo que la
  persona resolvió sobre las afirmaciones señaladas en el guion (verificada o corregida: había que frenar;
  descartada: no aplicaba); sin ninguna resuelta, no hay etiqueta independiente y el panel no calcula porcentaje.
  La del resultado es la corrección directa de su veredicto o, si no la hay, la revisión humana del clip; como el
  usuario ve ese veredicto (decisión de la 0.24.0 que se mantiene), se marca como **etiqueta no independiente**.
- **Métricas:** falso permiso (la sombra dejaba pasar y la persona no), bloqueo innecesario (la sombra frenaba y la
  persona dejó pasar), coincidencia con **la regla equivalente** (afirmaciones sin verificar; no la decisión global
  de la puerta, porque un freno por dinero no dice nada de las afirmaciones), coste y latencia por pregunta. La
  muestra es **una opinión por escena y pregunta**, agrupada en SQL; el gasto cuenta todas las filas. Se aplica la
  muestra mínima de la coherencia antes de enseñar porcentajes.
- **Credencial del operador y encargado.** La sombra usa la clave de TypeSafe de la instalación, la misma de la
  coherencia, cifrada con la bóveda; no es BYOK del usuario y su coste no entra en el registro de gasto de nadie.
  TypeSafe figura como encargado en `docs/legal/cumplimiento-y-privacidad.md`, pendiente de revisión jurídica, y la
  sombra no se puede encender sin marcar antes la casilla que lo reconoce.
- **El usuario no ve la sombra.** Sus lecturas solo las importa `/admin/decisiones` (candado de código): verla
  sesgaría la revisión humana con la que se mide.

## Consecuencias

`control_evaluations` gana cuatro columnas y nace `shadow_evaluations` (migración aditiva
`0057_decisiones-registradas-y-sombra`, con dos pasos de datos idempotentes: nombres ocultos en los motivos ya
guardados y puerta «frenos» para las evaluaciones antiguas del montaje); el sujeto `proyecto` se añade para el tope
del asistente. El índice por fecha se crea sin `CONCURRENTLY`: con una tabla grande conviene crearlo antes a mano. La reevaluación
del despacho y las puertas parciales pasan a registrar filas, así que la tabla crece algo más por envío.

La etiqueta de las afirmaciones solo existe donde el detector señaló algo y una persona lo resolvió; una escena sin
afirmaciones señaladas no aporta muestra. Con la sombra encendida, el guion y la descripción de las escenas sin
personas reales salen hacia TypeSafe, sin nombres, con la clave del operador; por eso está apagada de fábrica. Dos
envíos exactamente simultáneos del mismo texto todavía pueden pagarlo dos veces (unos 420 tokens).

Fuera de esta decisión: activar la sombra como control efectivo, Laya y las comparativas entre modelos. La
calibración de umbrales sobre una partición retenida queda para cuando haya datos del piloto.
