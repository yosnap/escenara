# ADR-0042 · Comparativas de modelos y calibración de umbrales con partición retenida

- **Estado:** Aceptada para 0.48.0; las tres decisiones de la fase son las recomendadas y quedan pendientes de revisión
  del propietario. La retención del conjunto etiquetado, pendiente de revisión jurídica.
- **Versión:** 0.48.0
- **Fecha:** 2026-09-30

## Contexto

El usuario quiere saber qué modelo le conviene antes de gastar, y la única forma que tenía era generar. El equipo, por
su parte, tiene desde la 0.39.0 decisiones registradas con la opinión de una sombra (Jev) y revisiones humanas, pero
ningún umbral calibrado: el ADR-0038 dejó la calibración para cuando hubiera datos.

El PRD (§9) marca los límites: el prototipo solo valida viabilidad; la confianza de un modelo de decisión describe la
forma de su distribución, **no** cuántas veces acierta; no hay una frontera universal; y **sin datos, el umbral no se usa
para automatizar**.

## Opciones

1. Una sola pantalla que mezcle datos del catálogo con generaciones de prueba. Fácil de usar, y fácil de gastar sin
   querer.
2. Dos caminos separados por diseño: comparar **sin generar** (solo lectura, coste cero garantizado por construcción) y
   comparar **generando** (A/B de una escena por el camino normal de la cola, con el número de ejecuciones y el coste
   confirmados). Calibrar con las revisiones que ya existen, en un conjunto seudonimizado (sin datos personales; vinculado a la opinión de origen y eliminado al borrar la cuenta) y con partición retenida.
3. Calibrar sobre toda la muestra y activar el umbral resultante. Sobreajusta y automatiza sin medir.

## Decisión

Se elige la segunda.

**Comparar sin generar** (`/comparar`) junta el precio y los datos públicos del catálogo (duraciones, proporciones,
resoluciones, voz e imágenes de referencia; **no** las notas, que son internas de quien administra y no hay una nota
pública), el historial del propio usuario (acotado a su
cuenta) y los ejemplos de plantillas y trends de la instalación (con la lista blanca de la 0.42.1: nunca una persona
real). El módulo no importa ningún adaptador de proveedor, ni la cola, ni el servicio de generación, ni la estimación
que consulta saldos; un test recorre sus importaciones de forma transitiva y falla si alguna llega a uno de ellos, y
otro la ejecuta con `fetch` bloqueado. El candado sigue `import`, `require`, plantillas sin `${}` y los `layout` de
Next; una importación con nombre calculado cuenta como prohibida. Es un candado contra accidentes, no contra quien
quiera saltárselo a propósito. La página no lleva JavaScript propio: elegir modelos para la tabla es cambiar la
URL. No se guarda nada: es una lectura.

**Comparar generando** (A/B) anima el fotograma aprobado de una escena con **dos** modelos (máximo y mínimo). Cada
alternativa pasa por `encolarAnimacion` → `crearAnimacion`: la puerta del motor de controles con la escena como sujeto,
el sello y el precio, la idempotencia y la reserva atómica de siempre. Lo propio de la A/B:

- el navegador confirma el número de ejecuciones y el coste total; el servidor comprueba que cuadran con lo que va a
  lanzar y vuelve a estimar cada alternativa (modelo elegido, sin reservas del mapa, tarifa de la duración del proyecto
  más la traducción). Si algo no cuadra, **no se encola nada**;
- **todo o nada**: con la fila del usuario y la de la escena bloqueadas (el mismo orden que la cola), se comprueba que no
  hay otra comparativa ni otro clip en marcha en la escena (si lo hay, 409 con su causa) y se guarda la comparativa
  **sin lanzar** (`launched_at` nulo), con la clave derivada de cada alternativa. Después se encola cada una por el
  camino normal, que es el que comprueba techo, presupuesto, credencial, saldo, ritmo, derechos, consentimiento y
  controles. **Mientras la comparativa no esté lanzada, el worker no toma ninguno de sus trabajos** (`cola/toma.ts`).
  Si todas caben, se marca lanzada; si una no cabe, las ya encoladas se cancelan sin haber salido, con su reserva
  liberada y los reintentos devueltos, y se responde con la causa y «No se ha cobrado nada». Una comparativa que se
  queda sin lanzar (el proceso murió) la cancela el worker pasados 10 minutos por el mismo camino;
- la clave es la marca: el encolado admite, **solo** para una clave y un modelo que estén en una comparativa de esa
  escena, tantos clips en marcha **de esa comparativa** como alternativas aunque la escena ya tenga el suyo; el worker no
  convierte una alternativa en el clip de la escena ni escribe su fallo en ella; y la producción no la cuenta como el
  último clip;
- **no hay atajo en los reintentos** (ADR-0024): si el último fotograma o clip de la escena (alternativas incluidas)
  falló con posible cobro, la comparativa exige y consume **un reintento autorizado por alternativa**, en la misma
  transacción que reserva, igual que «producir», «regenerar» u «otro clip». Sin autorización no se encola nada;
- elegir ganadora es elegir una versión (`usarVersionDeEscena`, 0.41.0), con todas sus puertas; se puede elegir una
  terminada aunque la otra siga en marcha (una alternativa no pasa a ser el clip al terminar). La ganadora que se ve es
  la que la escena usa ahora, también si se eligió desde sus versiones;
- **idempotencia por comparativa**: repetir la misma confirmación devuelve la comparativa si se lanzó y, si no salió,
  pide confirmar otra vez; nunca vuelve a encolar una alternativa.

**Conjunto etiquetado** (`labeled_examples`): se reconstruye entero desde Admin › Calibración con las revisiones
humanas registradas. De la pregunta de las afirmaciones, la opinión de la sombra más reciente y pagada de cada escena
con lo que la persona resolvió sobre sus afirmaciones (etiqueta independiente). Del resultado, la decisión de
coherencia más reciente de cada escena con la corrección de su veredicto o la revisión del clip (etiqueta **no**
independiente). De cada una se guardan **solo** cuánto encaja, la confianza, la etiqueta, la partición, la versión de
la pregunta y el modelo: ni texto, ni nombres, ni correos, ni identificadores de usuario (un test lo comprueba columna a
columna y valor a valor). La partición (`calibracion` 70 % | `retenido` 30 %) sale de un hash del identificador del
origen: reconstruir no mueve ningún ejemplo. La única referencia es a la opinión de origen, con borrado en cascada: al
borrar una cuenta (0.47.0) se borran sus opiniones y, con ellas, sus ejemplos. Mientras exista el origen, el conjunto es
**seudónimo**, no anónimo; no sale del servidor ni se exporta.

**Calibración** (`calibration_runs`): para cada pregunta se prueban umbrales de 0,50 a 0,95. Con la partición de
calibración se elige el de más cobertura entre los que dejan los falsos permisos en el 5 % o menos de las opiniones
firmes, con al menos 20; y se mide **solo** en la retenida (precisión, falsos permisos, bloqueos innecesarios,
cobertura). Hace falta una muestra mínima de 20 ejemplos en **cada** partición; por debajo no se propone nada y se dice
«Sin datos, el umbral no se usa para automatizar». Se guarda cada cálculo con su fecha y su muestra. **Proponer no
activa nada**: ningún control lee el umbral propuesto ni se vuelve bloqueante.

**Laya** no se evalúa en esta versión: hoy hay decenas de decisiones con corrección humana. Se evaluará como segundo
evaluador del contrato de decisiones cuando el conjunto llegue a **200**; Admin › Calibración enseña cuántas hay.

## Consecuencias

Nacen tres tablas (migración aditiva `0064_comparativas-y-conjunto-etiquetado`). El encolado hace una consulta más por
clip de escena (la marca de comparativa, por índice de escena), el cierre de un clip otra, y la toma del worker filtra
las alternativas de comparativas sin lanzar. La pasada del worker cancela las que se quedaron sin lanzar. `media/servicio.ts` separa
la vista de un medio (`media/dto.ts`) para que una lectura no arrastre la biblioteca entera.

Queda fuera: activar controles calibrados como bloqueantes (se decidirá con estas métricas delante), comparar entre
instalaciones o publicar comparativas, comparar fotogramas generando y guardar comparativas sin generar.
