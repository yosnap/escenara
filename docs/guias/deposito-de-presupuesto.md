# El depósito de presupuesto y la cola

Guía de las dos cosas que cambian en Escenara a partir de la versión **0.12.0**: los trabajos van a una **cola** que atiende el servidor, y cada trabajo **reserva** antes lo que puede llegar a costar.

## Lo primero: el presupuesto no es dinero de Escenara

Escenara no vende créditos y no cobra nada. Cada generación se paga con los créditos de **tu propia cuenta** en el proveedor (KIE.ai), con tu clave.

El presupuesto es otra cosa: es el **tope que esta instalación autoriza a comprometer**. Sirve para que un error, un script o un despiste no te vacíen la cuenta del proveedor en diez minutos. Quien administra lo configura en Admin › Ajustes.

Por eso en «Crear» hay dos cifras distintas y las dos importan:

- **Tu saldo en KIE**, en el panel de coste: lo que de verdad tienes en el proveedor.
- **Tu depósito de presupuesto**: lo que esta instalación te autoriza a gastar.

Un trabajo sale adelante solo si le llegan las dos. El presupuesto no puede autorizar un gasto que el proveedor no tenga.

## El depósito de presupuesto

Aparece arriba en **Crear** y en el **historial**, con cuatro cifras:

| Cifra | Qué es |
|---|---|
| **Autorizado** | El tope por cuenta que fija quien administra, igual para todas las cuentas por ahora. «Sin tope propio» si lo ha puesto a 0. |
| **Reservado ahora** | Lo apartado por trabajos que aún no han terminado. Es una **estimación** del coste máximo. |
| **Consumido** | Lo que ya has gastado. Cuando el proveedor informa el coste real, es esa cifra. |
| **Disponible** | Lo que te queda por comprometer: autorizado menos reservado menos consumido. |

**Por qué se reserva antes.** Si dos trabajos empezaran a la vez y cada uno comprobara «me queda presupuesto», los dos podrían gastar el mismo saldo. Reservando antes de enviar, el segundo ve que el primero ya apartó lo suyo. Al terminar, la reserva se suelta y en su lugar queda el consumo real: si el trabajo costó menos de lo estimado, la diferencia vuelve a estar disponible.

Si te quedas sin presupuesto disponible, Escenara te lo dice con las cifras delante y te da dos salidas: esperar a que terminen los trabajos en marcha, o pedirle más presupuesto a quien administra.

## La cola: ya puedes cerrar el navegador

Antes, pedir una generación la enviaba al proveedor en ese mismo momento y había que dejar la pestaña abierta. Ahora el trabajo **se pone en cola** y lo envía un proceso del servidor (el *worker*).

Lo que vas a ver:

- **«En cola»**, con tu puesto: «es el siguiente en salir» o «hay 2 trabajos delante del tuyo». Es un puesto real, no una barra de progreso inventada.
- **«En cola en el proveedor»** y **«Generando»**: ya está en KIE. A partir de aquí no se puede cancelar.
- **«Listo»**, con el archivo guardado en tu biblioteca.

Puedes cerrar la página en cualquier momento. Al volver al historial verás el estado real, sin tener que pulsar nada.

**Si nadie está atendiendo la cola**, Escenara lo dice en lugar de dejarte esperando: quiere decir que el proceso del worker no está en marcha. No se pierde nada y nada se envía dos veces; avisa a quien administra la instalación.

## Cancelar un trabajo

Mientras el trabajo siga **en cola** (o esperando tu límite de gasto), tienes un botón **Cancelar**: el trabajo no se envía y su reserva se suelta al momento, así que no te cuesta nada.

Un trabajo **ya enviado al proveedor no se puede cancelar**. Cancelarlo en el proveedor llegará en una versión posterior, y solo si el proveedor lo admite. Lo que Escenara no hará nunca es reenviarlo: si algo queda a medias, solo se vuelve a **consultar** la tarea que ya existe, porque reenviar podría cobrártela dos veces.

## «Esperando tu límite de gasto»

Algunos modelos no dicen cuánto va a durar el clip que generan, y su precio se cobra por unidad de tiempo. En ese caso Escenara **no puede acotar lo que va a costar**, así que no lo envía: el trabajo se queda esperando y te pide un número.

Escribe cuántos créditos autorizas y pulsa **Autorizar y encolar**. Eso exacto es lo que se reserva de tu presupuesto, y el trabajo pasa a la cola. Si prefieres no arriesgarte, cancélalo: no te habrá costado nada.

**El límite es tu decisión, no una garantía frente al proveedor.** El precio final lo decide él. Si cobrara más de lo que autorizaste, Escenara no lo puede deshacer, así que hace lo único honesto: apunta el gasto real y te avisa en el propio trabajo. Quien administra la instalación también lo ve, porque un cobro de más repetido significa que el precio registrado de ese modelo está desfasado.

## «El envío se interrumpió antes de llegar al proveedor»

Si el proceso que atiende la cola se cae justo mientras preparaba tu trabajo, este se cierra en lugar de volver a intentarse solo. No te ha costado nada —el proveedor no se enteró— y puedes volver a pedirlo cuando quieras.

Se hace así a propósito: devolver a la cola un trabajo que quizá ya había salido es la única forma de que se enviara dos veces, y preferimos pedirte que lo repitas antes que arriesgarnos a cobrarte doble.

## «Sin respuesta del proveedor»

Es el estado honesto cuando el proveedor no contesta: **no se sabe** si aceptó el trabajo y si lo cobró.

Un corte de red pasajero **no** deja un trabajo así: si falla una consulta, lo que ha fallado es la pregunta, no el trabajo, y se vuelve a preguntar más tarde. A esto solo se llega cuando el envío se interrumpió sin saber el resultado o cuando el trabajo lleva más de media hora en el proveedor sin terminar (lo normal son minutos).

Cuando pasa:

- el trabajo **no se reenvía**, nunca;
- su reserva **se queda apartada**, porque soltarla sería dar por hecho que no se pagó;
- tienes el identificador de la tarea a la vista, para comprobarlo en el panel del proveedor;
- puedes pulsar **Volver a consultar** para preguntar por esa misma tarea.

Si aun así no se aclara, quien administra la instalación lo cierra desde el panel con los créditos que haya comprobado de verdad, y el motivo queda escrito en el registro de gasto.

## Para quien administra

En **Admin › Ajustes › Presupuesto y cola**:

- **Presupuesto por usuario (créditos)**: el tope de cada cuenta. 0 = sin tope propio (manda solo el saldo del proveedor).
- **Tope por trabajo (créditos)**: ningún trabajo suelto puede reservar más. Es el freno contra un error puntual muy caro.
- **Trabajos simultáneos por usuario**: cuántos puede tener a la vez en cola o en el proveedor.
- **URL pública y secreto de los callbacks**: opcionales. Con los dos puestos, Escenara le pasa al proveedor una dirección de aviso en cada trabajo, con un token propio de ese trabajo, y así la conciliación es más rápida. No hay que configurar nada en el panel del proveedor. Sin ellos funciona igual, solo con el sondeo del worker.

  **Al publicar, ten en cuenta dónde acaba ese token.** Va en la **cadena de consulta de la URL**, así que aparecerá en los registros de acceso de cualquier proxy, CDN o balanceador que tengas delante, y en los del propio proveedor. No da acceso a nada más que a pedir la conciliación de **ese** trabajo (y el estado se le pregunta al proveedor, así que no permite inventar un resultado ni un gasto), pero si tus registros de acceso se guardan mucho tiempo o los ve más gente de la cuenta, configura el proxy para no registrar la cadena de consulta de `/api/generacion/callback/*`. Si no quieres esa exposición, deja la URL pública vacía: el sondeo del worker hace el mismo trabajo, solo un poco más tarde.

En **Admin › Trabajos** ves los trabajos sin respuesta con su reserva retenida y los cierras con los créditos comprobados, los cobros por encima del límite autorizado, y el estado de los workers de la cola. Si cierras un trabajo y luego descubres que el importe era otro, vuelve a cerrarlo con la cifra correcta: el segundo ajuste apunta la diferencia, así que el gasto acaba siendo el real y no la suma de los dos.

El worker se arranca con `bun run worker`, o junto a la web con `bun run dev`. Los detalles están en `CONTRIBUTING.md`.
