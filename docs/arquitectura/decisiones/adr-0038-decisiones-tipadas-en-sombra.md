# ADR-0038 · Decisiones registradas con evidencia y evaluación tipada en sombra

- **Estado:** Aceptada para 0.39.0; las dos preguntas y el uso de la clave del operador son decisiones por defecto
  pendientes de revisión del propietario.
- **Versión:** 0.39.0
- **Fecha:** 2026-09-30

## Contexto

El motor de controles (ADR-0023) ya guardaba cada evaluación de la puerta de envío con su estado, sus reglas y su
versión, pero no **qué se miró** ni **con qué umbrales**, y había puntos de decisión que no dejaban rastro: el tope
del proyecto ante el asistente de guion, la puerta previa del canto, la puerta de producción de una escena y la
reevaluación del despacho antes de subir una cara al proveedor. La coherencia (ADR-0030) ya hablaba con Jev en
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
  texto de nadie), los parámetros como umbrales, la versión de reglas, la puerta (`envio` o `frenos`) y la acción
  (`permite`, `pide-confirmacion`, `rechaza`). Un candado de código comprueba que el motor no se llama desde
  ningún otro sitio que decida.
- **La sombra no bloquea.** Tras una decisión de la puerta de envío sobre una escena, Jev evalúa en paralelo la
  pregunta «¿el guion contiene una afirmación que exige verificación?» (`noul`). La puerta no la espera; un
  fallo, un error o un tiempo agotado (10 s) se guardan como fallo, nunca como opinión, y no cambian nada. Con la
  sombra apagada no se lee la clave ni se llama a nadie. El mismo texto no se paga dos veces y hay un tope diario
  por usuario.
- **La segunda pregunta se reutiliza.** «¿La escena generada corresponde a la descripción?» es la comprobación
  `resultado` de la coherencia: necesita percibir el clip, así que sigue pidiéndose desde la revisión y su
  registro es el de siempre.
- **Umbrales por pregunta, sin frontera universal.** Cada pregunta tiene su umbral en Admin › Ajustes; por debajo,
  la opinión cuenta como «no opina». El umbral solo ordena la medición: no automatiza nada.
- **La etiqueta humana se deriva, no se copia.** Es la revisión humana de la escena (ADR-0020 y 0.20.0) hecha
  después de la decisión y antes de volver a producir, o la corrección directa de un veredicto de coherencia. Solo
  se etiquetan las decisiones que dejaron pasar: si las reglas frenaron, no hubo nada que revisar.
- **Métricas:** falso permiso (la sombra dejaba pasar y la persona rechazó), bloqueo innecesario (la sombra frenaba
  y la persona aceptó), coincidencia con las reglas, coste y latencia por pregunta, con la muestra mínima de la
  coherencia antes de enseñar porcentajes.
- **Credencial del operador.** La sombra usa la clave de TypeSafe de la instalación, la misma de la coherencia,
  cifrada con la bóveda; no es BYOK del usuario y su coste no entra en el registro de gasto de nadie.
- **El usuario no ve la sombra.** Sus lecturas solo las importa `/admin/decisiones` (candado de código): verla
  sesgaría la revisión humana con la que se mide.

## Consecuencias

`control_evaluations` gana cuatro columnas y nace `shadow_evaluations` (migración aditiva
`0057_decisiones-registradas-y-sombra`); el sujeto `proyecto` se añade para el tope del asistente. La reevaluación
del despacho y las puertas parciales pasan a registrar filas, así que la tabla crece algo más por envío.

La etiqueta es **de la escena**, no de la pregunta: quien rechaza un clip puede hacerlo por otra cosa. El panel la
presenta como referencia. Con la sombra encendida, el guion y la descripción de cada escena salen hacia TypeSafe
con la clave del operador; por eso está apagada de fábrica y su descripción lo dice.

Fuera de esta decisión: activar la sombra como control efectivo, Laya y las comparativas entre modelos. La
calibración de umbrales sobre una partición retenida queda para cuando haya datos del piloto.
