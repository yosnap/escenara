# ADR-0024 · Cancelación y reintentos en la producción de escenas: nada se reenvía y nada se cancela en el proveedor

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.19.0

## Contexto

Hasta la 0.18.0 producir era un gesto suelto: en «Crear» se pedía un fotograma, luego un clip, y cada uno era una
decisión independiente. La 0.19.0 produce **un proyecto entero**, escena a escena, y eso cambia dos cosas de sitio:

- **el gasto deja de ser uno.** Un proyecto de tres escenas son seis trabajos de pago encadenados. Un usuario que
  pulsa «producir» una vez está autorizando una secuencia, no una llamada;
- **y aparecen dos preguntas que antes no existían**: ¿qué pasa si quiere parar a mitad, y qué pasa si algo falla
  cuando ya se ha pagado?

Las dos tienen respuestas fáciles y equivocadas. «Cancelar» sugiere que se puede parar lo que ya está en marcha.
«Reintentar» sugiere que volver a intentarlo es gratis. Ninguna de las dos es verdad, y las dos cuestan dinero de
la cuenta de otra persona, porque en Escenara se paga con la clave del propio usuario (ADR-0009).

Lo que se sabe del proveedor, comprobado en `docs.kie.ai` el 2026-09-27 **sin llamar a la API**: su guía de tareas
asíncronas documenta el `task_id`, el callback y la consulta del registro. **No documenta ningún endpoint de
cancelación**, y para preguntar por esa funcionalidad remite a su soporte.

Y lo que ya estaba decidido y no se toca: la lista blanca de rechazos probados de 0.12.0 (solo se da por «no
cobrado» lo que el proveedor ha rechazado con una respuesta que lo prueba), el estado `enviando` como frontera a
partir de la cual un trabajo no vuelve nunca a la cola, y la regla de que una reserva solo se libera cuando se
sabe qué ha pasado (ADR-0016).

## Opciones

### Para cancelar

1. **Llamar a un endpoint de cancelación del proveedor.** Supone que existe. No existe en la documentación, así que
   la opción no es «peor»: es que no se puede implementar sin inventarse una URL.
2. **Cancelar todo «en Escenara»: marcar el trabajo como cancelado y soltar su reserva.** Supone que dejar de mirar
   una tarea equivale a que no se cobre. Falla en lo único que importa: la tarea sigue corriendo en el proveedor y
   se cobrará igual, así que soltar la reserva convierte un gasto real en un hueco en el presupuesto. Es la forma
   más rápida de que el depósito mienta.
3. **Cancelar solo lo que todavía no ha salido, y decir del resto que se cobrará.** Supone que el usuario prefiere
   una respuesta incómoda y verdadera a una cómoda y falsa.

### Para reintentar

1. **Reintentar automáticamente los fallos, como hace la cola con los fallos internos.** Supone que un fallo del
   proveedor es equivalente a un fallo de preparación. No lo es: la cola reintenta lo que ocurre **antes** de
   hablar con el proveedor, donde se sabe que no ha costado nada. Un fallo *después* puede haberse cobrado, y
   reintentarlo cobra otra vez. En un proyecto de diez escenas, un fallo sistemático (un prompt que el proveedor
   rechaza) multiplicaría el gasto por el número de intentos sin que nadie lo hubiera pedido.
2. **No permitir reintentar nunca lo que pudo cobrarse.** Es seguro y es inútil: un fallo transitorio obligaría a
   rehacer el proyecto a mano.
3. **Cero reintentos automáticos, y reintentos por escena con presupuesto explícito del usuario.** Supone que el
   usuario puede decidir cuánto está dispuesto a arriesgar en **esa** escena, por separado.

## Decisión

Se eligen las **opciones 3** de las dos listas, y se fijan como decisión de arquitectura porque las dos son reglas
de dinero y las dos se tendrían que romper a propósito para volver atrás.

### Cancelación

- **Se cancela solo lo que todavía no ha salido hacia el proveedor** (`en_cola`, `esperando_limite`). Esos trabajos
  se cierran como `cancelado` y **sueltan su reserva** en la misma transacción que el cambio de estado: no han
  costado nada, y decirlo es exacto.
- **Un trabajo ya enviado no se cancela.** Se marca «se cobrará», sigue hasta el final y **su reserva no se
  libera**. Nunca se reenvía.
- La condición del estado va **dentro** del `UPDATE`, así que si un worker lo ha tomado justo antes, la cancelación
  no hace nada y eso se cuenta como «se cobrará» en lugar de romper la cancelación de los demás trabajos.
- La interfaz **dice las dos cosas antes de pulsar** y las dos después, con la cuenta de cada una. El texto lo
  compone una función pura (`lib/produccion.ts › textoDeCancelacion`), que es la que se prueba: no hay forma de que
  una pantalla prometa cancelar lo que se está pagando.
- Si algún día el proveedor documenta una cancelación, esto no cambia de forma: se añade un intento de cancelar en
  el proveedor **antes** de decidir el destino del trabajo, y el resto de la regla sigue igual.

### Reintentos

- **Cero reintentos automáticos de un fallo con coste posible** (PRD §6). La cola sigue reintentando lo que falla
  antes de hablar con el proveedor (`interno`, `limite`), que es lo que no cuesta nada.
- Cuando un trabajo de escena falla, lo único que ocurre en automático es que **la escena apunta el motivo** en
  lenguaje llano. No se reenvía nada, no se consume ningún reintento y no se autoconcede ningún presupuesto.
- El usuario puede **autorizar un presupuesto de reintentos por escena**, en número de reintentos. Regenerar una
  escena cuyo último trabajo falló con coste posible **consume uno**, y sin presupuesto autorizado se responde 409
  diciendo qué hacer.
- Qué cuenta como «coste posible» no se decide aquí: es la lista blanca de 0.12.0 leída al revés
  (`lib/produccion.ts › FALLOS_SIN_COSTE`). `temporal`, `contenido` y `respuesta` quedan fuera de la lista blanca
  porque puede haberse pagado; `interno`, `limite`, `cancelado`, `consentimiento`, `sin_acotar`, `credencial` y
  `saldo` se cierran sin coste probado.
- Una regeneración **voluntaria** de algo que salió bien no consume reintentos: no es un reintento, es otro gasto
  que el usuario confirma como cualquier otro.

### Dos reglas de alcance que sostienen a las dos anteriores

- **Una escena no toca a las demás.** Regenerar, cancelar o autorizar reintentos escriben solo en su fila y encolan
  solo sus trabajos. Hay test.
- **Producir pasa siempre por la puerta única de 0.18.0 con `escenaId`.** `server/produccion` decide *qué* escena
  toca; *si se puede gastar* lo decide el motor de controles dentro de `generacion/servicio.ts`, con la reserva
  atómica, el tope por trabajo, el del usuario, el del proyecto y el nuevo tope de **escenas en vuelo**.

### Consecuencias

- Un usuario que quiere parar una producción a mitad sabe exactamente qué va a pagar. No puede evitar el gasto de
  lo que ya salió, y eso se le dice en lugar de ocultárselo con una animación de «cancelando».
- Un fallo del proveedor deja el proyecto parado y pidiendo una decisión. Es más lento que reintentar solo, y es
  la única forma de que un fallo sistemático no se convierta en una factura.
- Hace falta una columna de reintentos consumidos y de presupuesto por escena, y una de motivo del último fallo.
  Son tres columnas para no tener que adivinar nada después.
- El tope de escenas en vuelo (2 por defecto) hace que producir un proyecto largo sean varias pulsaciones. Es un
  coste de comodidad aceptado a cambio de que el gasto comprometido no crezca por delante de lo que el usuario ha
  visto.

## Qué queda pendiente del propietario

- Confirmar las dos políticas tal como están fijadas aquí.
- Confirmar el tope por defecto de escenas en vuelo (2) y el máximo de reintentos autorizables por escena (10).
- Decidir si se abre una consulta al soporte de KIE sobre la cancelación de tareas. Si contestan que existe, esta
  decisión se amplía con un ADR nuevo; no se cambia este.
