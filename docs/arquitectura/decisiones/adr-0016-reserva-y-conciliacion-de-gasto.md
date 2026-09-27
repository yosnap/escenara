# ADR-0016 · Reserva y conciliación del gasto: registro de apuntes como única verdad

- **Estado:** aceptado
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.12.0

## Contexto

Con la cola (ADR-0003) un trabajo deja de enviarse dentro de la petición del navegador, así que puede haber varios trabajos del mismo usuario en marcha a la vez. Eso abre dos formas de perder dinero:

- **gastar el mismo saldo dos veces**: dos trabajos simultáneos que compruebe cada uno «me queda presupuesto» y lo gasten los dos;
- **cobrar dos veces el mismo trabajo**: un sondeo, un callback del proveedor y una consulta a mano pueden cerrar el mismo trabajo casi al mismo tiempo.

Hay además un caso que no es un error sino una decisión de producto (PRD §6): cuando el coste **no se puede acotar**, el trabajo no debe salir. Y un caso honesto que hay que saber representar: cuando el proveedor no contesta, no se sabe si ha cobrado.

## Opciones

1. **Columna de saldo por usuario** que se suma y se resta. Supone que ninguna operación se queda a medias. Falla primero en cuanto una liberación se pierde o se duplica: el saldo queda mal y no hay forma de averiguar por qué.
2. **Registro de apuntes** (`usage_ledger`) del que se calcula todo sumando. Supone que sumar apuntes es lo bastante barato, lo cual es cierto con decenas de apuntes por usuario. Falla primero si el registro creciera hasta hacer lenta la suma, que se resolvería con un cierre periódico.
3. **Pedirle el gasto al proveedor cada vez.** Falla de entrada: el proveedor informa el consumo cuando la tarea termina, no lo que hay reservado por trabajos en marcha, que es justo lo que hay que acotar **antes** de enviar.

## Decisión

Se elige la **opción 2: un registro de apuntes (`usage_ledger`) como única fuente de verdad**. No existe ninguna columna con «saldo restante».

Cuatro tipos de apunte: `reserva` (coste máximo estimable, positivo), `liberacion` (devuelve la reserva, negativo), `consumo` (lo que ha costado de verdad, positivo) y `ajuste` (corrección manual con motivo escrito). De ahí salen las dos cifras que se muestran: `reservado = Σ reserva − Σ liberacion` y `consumido = Σ consumo + Σ ajuste`.

Reglas que acompañan a la decisión:

- **La reserva va en la misma transacción que el encolado**, con la fila del usuario bloqueada (`select … for update`), igual que la cuota de la biblioteca de 0.8.0. Es lo que hace que dos trabajos simultáneos no reserven el mismo saldo: el segundo espera el bloqueo y ve lo que hizo el primero.
- **El consumo y la liberación son idempotentes por trabajo**, con un índice único parcial sobre `(job_id, entry_type)` para los apuntes automáticos. Un sondeo y un callback que lleguen los dos no crean un segundo consumo. Los ajustes quedan fuera del índice: corregir dos veces a mano es legítimo.
- **Nunca se presupone un precio fijo.** Cada apunte guarda si sus créditos son estimados o informados por el proveedor (`informed`) y con qué versión y sello del registro de precios se calcularon.
- **Si el coste no se puede acotar, el trabajo no sale.** La regla es determinista y sale del catálogo: un clip cuyo modelo no declara duración no tiene coste acotable, porque el precio registrado cubre una unidad de tiempo que decidiría el proveedor. Ese trabajo queda en `esperando_limite`, **sin reservar nada**, hasta que el usuario autoriza un techo de créditos; lo que autoriza es exactamente lo que se reserva, y se guarda aparte de la estimación original del trabajo. `esperando_limite` **cuenta para el tope de trabajos simultáneos**: si no contara, se podrían acumular muchos y autorizarlos todos de golpe, desbordando el tope. El tope se vuelve a comprobar dentro de la transacción que autoriza, porque entre pedir el trabajo y autorizarlo puede haber pasado un rato largo.
- **Un techo autorizado no es una garantía frente al proveedor**, y no se finge que lo sea. El precio final lo decide él: si cobra más que el techo, se apunta el **consumo real** (mentir sobre el gasto sería peor que el propio exceso) y además se registra el exceso en el trabajo y en el registro de gasto, con aviso para quien lo pidió y lista propia en `/admin/trabajos`. Un exceso repetido es el síntoma de un precio del catálogo desfasado, y por eso quien administra tiene que verlo.
- **Un ajuste manual apunta la diferencia**, no el importe entero: `créditos comprobados − lo que ya constaba`. Así una segunda corrección sobre el mismo trabajo corrige de verdad en lugar de sumarse a la primera.
- **Un trabajo `desconocido` mantiene su reserva retenida.** Soltar lo que quizá se ha pagado sería mentir sobre el gasto. Esos trabajos se ven en `/admin/trabajos`, donde quien administra los cierra con los créditos que haya comprobado en el proveedor y el motivo queda escrito en el registro.
- **Un fallo que no ha llegado al proveedor suelta la reserva** con un consumo de cero créditos: el trabajo queda cerrado y no se puede volver a cobrar.
- **El presupuesto de Escenara y el saldo del proveedor son dos cosas distintas** y se muestran por separado. El presupuesto es el tope que esta instalación autoriza; el saldo es lo que de verdad hay en la cuenta del usuario. El presupuesto no puede autorizar gasto que el proveedor no tenga, así que se siguen comprobando los dos.

El ámbito del presupuesto en esta versión es **por usuario y por trabajo**, configurado en Admin › Ajustes con valor por defecto. El presupuesto por proyecto y etapa llega con 0.17.0.

## Consecuencias

Se gana: un historial de gasto auditable en el que cada cifra se puede explicar apunte a apunte; imposibilidad estructural de doble cobro (el índice único lo impide, no la disciplina de quien escribe el código); y una forma honesta de representar «no sabemos si se pagó», que es retener la reserva y pedir una revisión.

Se pierde: lo comprometido se calcula sumando en cada lectura, así que el depósito no es una sola columna que leer. Con decenas de apuntes por usuario es irrelevante.

Habrá que revisar: si el registro crece mucho, un cierre periódico que consolide apuntes viejos en un saldo de arranque; y cuando llegue el presupuesto por proyecto (0.17.0), el ámbito del apunte tendrá que incluir el proyecto y la etapa.
