# ADR-0003 · Cola de trabajos sobre PostgreSQL con `FOR UPDATE SKIP LOCKED`

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.12.0

## Contexto

Hasta la 0.11.0 una generación se enviaba **en línea**, dentro de la petición del navegador, y el estado lo avanzaba un bucle dentro del propio proceso del servidor web (ADR-0014). Eso dejaba tres problemas abiertos:

- el envío dependía de que la petición HTTP siguiera viva;
- el bucle vivía en memoria del proceso, así que **se asumía una sola instancia** del servidor: con dos, las dos tomarían el mismo lote;
- no había reintentos con política propia ni forma de saber si alguien estaba atendiendo el trabajo.

La restricción que manda sobre todo lo demás es el dinero: un trabajo ya enviado al proveedor **no se reenvía nunca**, porque podría cobrarse dos veces. Cualquier cola que se elija tiene que hacer trivial distinguir «esto todavía no ha salido» de «esto ya está en el proveedor».

El contexto operativo importa: Escenara se instala en el equipo de una persona o en un servidor pequeño, ya hay PostgreSQL (ADR-0012) y el objetivo declarado del proyecto es tener pocas piezas que operar (ADR-0002, ADR-0010).

## Opciones

1. **Cola en PostgreSQL** con una tabla de trabajos y toma mediante `SELECT … FOR UPDATE SKIP LOCKED`. Supone que el volumen es de decenas o cientos de trabajos por día, no de miles por segundo. Fallaría primero si la toma se volviera tan frecuente que el bloqueo de filas se notara, algo que no se ve con trabajos que tardan minutos en el proveedor.
2. **Redis con BullMQ.** Supone que merece la pena operar (y respaldar) una segunda base de datos. Fallaría primero en la instalación local: un servicio más que arrancar, y el estado del gasto quedaría repartido entre Redis y PostgreSQL, con lo que la reserva de presupuesto y la cola ya no podrían compartir transacción.
3. **pg-boss** (cola sobre PostgreSQL, pero como dependencia). Supone que su modelo de trabajos encaja con el nuestro. Fallaría primero en la parte que no es genérica: la reserva de presupuesto tiene que ir en la **misma transacción** que el encolado, y la prohibición de reenviar depende de nuestro `task_id`, no de su noción de reintento.

## Decisión

Se elige la **opción 1: cola en PostgreSQL con `FOR UPDATE SKIP LOCKED`**, implementada en `apps/web/src/server/cola/`, y un **worker como proceso `bun` aparte** (`apps/web/scripts/worker.ts`).

Piezas de la decisión:

- **Una sola tabla**, `generation_jobs`, con las columnas de cola (`priority`, `attempts`, `max_attempts`, `available_at`, `locked_by`, `locked_until`, `failure_reason`, `reservation_id`, `credit_limit`). No hay tabla de cola aparte: el trabajo y su puesto en la cola son la misma cosa, y así el puesto que se le muestra al usuario es un dato real.
- **La toma es un solo `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`**. Atómico: dos workers no se llevan el mismo trabajo porque el segundo salta las filas bloqueadas. No hace falta ningún cerrojo fuera de la base de datos.
- **El envío está partido en dos mitades que no se mezclan.** Preparar (resolver modelo, credencial y referencia) ocurre en estado `preparando` y no toca dinero, así que se puede reintentar. Llamar al proveedor ocurre en estado `enviando`, que **se marca antes de llamar** y en el mismo `UPDATE` que renueva la toma, condicionado a que la fila siga siendo de este worker. Si ese `UPDATE` no afecta a ninguna fila, no se llama al proveedor: otro worker la tiene.
- **Tras obtener el `taskId` solo se reintenta la escritura, nunca la llamada.** Si la base de datos falla al guardarlo, se insiste unas cuantas veces; si aun así no se consigue, el `taskId` se registra en el log (sin ninguna clave) y el trabajo queda `desconocido` con la reserva retenida. Se ha pagado y hay que resolverlo a mano, pero no se reenvía.
- **La toma caduca** (`locked_until`, 3 minutos), y lo que decide qué hacer al recuperarla es **el estado, no el reloj**:
  - `preparando` sin `task_id`: no se llamó al proveedor, así que el trabajo se **cierra** como fallido y suelta su reserva. No ha costado nada y la persona puede volver a pedirlo.
  - `enviando` sin `task_id`: **puede haber una tarea cobrada** que no llegamos a apuntar. Pasa a `desconocido` con la reserva retenida.
  - con `task_id`: la tarea existe. Pasa a `enviado` y desde ahí solo se **consulta**.

  **Ninguna rama devuelve un trabajo a la cola de envío.** Volver a la cola es lo único que permitiría que dos workers enviaran lo mismo, así que esa transición no existe después de haber tomado un trabajo.
- **Una fila `enviando` conserva su toma hasta que caduca.** Soltarle la toma la dejaría con `locked_until` a nulo y, como la recuperación busca tomas vencidas, se quedaría atrapada en `enviando` para siempre: ni cerrada, ni en revisión, con su reserva apartada y sin que nadie mirase esa tarea posiblemente pagada. Por eso `soltarToma` excluye ese estado y la recuperación recoge también las filas `enviando` que hayan perdido la toma.
- **Un fallo al consultar no cambia el estado de nada.** Lo que falla es nuestra pregunta, no la tarea. Del intento solo queda `polled_at`, que es lo que espacia las consultas, y el único camino automático a `desconocido` por falta de respuesta es el techo de edad. Así ninguna ruta de lectura —ni el navegador, ni el historial, ni el sondeo del worker— puede mover dinero.
- **Solo se reintentan los fallos anteriores a la llamada** (`interno`: nuestra preparación). Una vez llamado el proveedor, los únicos destinos son `enviado`, `desconocido` o `fallido` con la reserva suelta. Eso incluye los rechazos por ritmo (`limite`): aunque sean gratis y se sepa que no crearon tarea, se cierran en lugar de reencolarse, porque no queremos ninguna ruta de reenvío automático que haya pasado por el proveedor. El coste de esa decisión es que un rechazo por ritmo obliga a la persona a volver a pedirlo.
- **El tiempo que un trabajo lleva «en marcha» se mide desde que salió** (`coalesce(sent_at, created_at)`), no desde que se pidió. Un trabajo puede haber esperado horas en la cola porque el worker estaba parado, y eso no dice nada de cuánto lleva generando.
- **El worker es un proceso aparte**, no un temporizador dentro del servidor web. En local lo arranca `bun run dev` junto a la web (`scripts/dev.ts`); en el servidor será un servicio propio. El seguimiento de fondo de 0.10.0 desaparece: ahora **solo el worker** consulta al proveedor en automático, así que no hay dos mecanismos preguntando lo mismo.
- **Latido con caducidad** (`queue_workers`, 60 s). No reparte trabajo: sirve para poder decirle al usuario «ahora mismo no hay nadie atendiendo la cola» en lugar de dejarle mirando un «en cola» eterno, y para que `/admin/trabajos` muestre qué workers hay. Las filas sin latido reciente se borran en cada pasada, porque un worker que muere de golpe no se da de baja.
- **El bucle del worker no acumula pasadas**: hay un tope de pasadas en vuelo y, al parar, se espera a todas. El plazo para dar una pasada por colgada es mayor que la duración de una toma, para que al avisar sus tomas ya hayan caducado y las resuelva la recuperación de huérfanos.
- **Los callbacks del proveedor son un atajo, nunca la fuente de verdad.** Cuando la instalación tiene URL pública y secreto configurados, al crear la tarea se le pasa a KIE el parámetro `callBackUrl` (nombre comprobado en `docs.kie.ai` el 2026-09-27; va al nivel de `model` e `input`). Esa URL lleva el identificador del trabajo y **un token aleatorio propio de ese trabajo**; en la base de datos solo se guarda `sha256(secreto:token)`, así que ni el token ni nada reutilizable quedan escritos y la huella no sirve sin el secreto de la bóveda. La ruta valida el token **en tiempo constante**, corta antes de leer ajustes o abrir la bóveda si el token falta o está deforme, y **del cuerpo no usa nada**: dispara una sola consulta al proveedor por el `task_id` guardado. Sin URL pública no se envía `callBackUrl` y la ruta responde 404. El sondeo del worker sigue funcionando siempre.

## Operar los callbacks

El token del callback viaja en la **cadena de consulta** de la URL que se le da al proveedor, así que queda en los registros de acceso de cualquier proxy o CDN que haya delante y en los del proveedor. Es una exposición acotada a propósito: el token solo sirve para pedir la conciliación de **ese** trabajo, y como el estado y los créditos se le preguntan al proveedor, tenerlo no permite dar por listo nada ni inventar un gasto. Aun así, al publicar conviene dejar de registrar la cadena de consulta de `/api/generacion/callback/*`, y quien prefiera no tener esa exposición puede dejar la URL pública vacía: el sondeo del worker hace lo mismo un poco más tarde.

Se eligió la cadena de consulta y no una cabecera porque el proveedor solo acepta una URL (`callBackUrl`) y no permite configurar cabeceras propias.

## Consecuencias

Se gana: una pieza menos que operar y respaldar; la reserva de presupuesto y el encolado en la misma transacción (que es lo que evita que dos trabajos simultáneos gasten el mismo saldo); varias instancias del servidor y varios workers sin trabajo duplicado; y un puesto en la cola que se puede mostrar porque se cuenta de verdad.

Se pierde: el panel de operaciones y las políticas de reintento que BullMQ da hechas, y el rendimiento de una cola en memoria, que aquí no hace falta. El techo razonable de esta implementación son unos cuantos miles de trabajos al día; si algún día se supera, la interfaz interna (`server/cola/`) es la que habría que sustituir, no las rutas ni la interfaz.

Habrá que revisar: si aparece la necesidad de programar trabajos a futuro o de cadenas largas de dependencias entre ellos, que es donde una cola dedicada empieza a ganar de verdad. También si el rechazo por ritmo del proveedor resulta frecuente: hoy cierra el trabajo, y si molestara habría que reencolarlo **con la garantía explícita** de que solo se reencola lo que el proveedor rechazó con una respuesta.

## Nota sobre el contrato de decisiones

`server/decisiones/` se añade en esta versión como preparación de 0.24.0 (Jev y Laya). Hoy su única implementación son reglas deterministas que se ejecutan antes de encolar, y **dos partes del contrato todavía no se consumen**: el `coste` de la decisión (siempre cero, porque no hay servicio que cobre) y el `nombre` del decisor (solo hay uno). Se dejan en el contrato a propósito, porque son justo lo que hará falta cuando haya un servicio detrás: quien lo añada no tendrá que cambiar la forma del contrato ni a quien lo usa.
