# Por qué no puedo generar

Guía de uso · versión 0.18.0

Antes de gastar un solo crédito, Escenara comprueba si se puede generar y te lo dice en una sola zona: el panel
**«Antes de generar»**, justo encima del botón. Esas comprobaciones **son gratis**: mirar el panel no encola nada,
no aparta presupuesto y no le pide nada de pago a ningún proveedor.

![Panel «Antes de generar» con el estado de los controles previos](../assets/capturas/0.18.0-controles-claro.webp)

## Los cuatro estados

Cada estado se distingue por **color, icono y texto**, así que se lee igual en escala de grises y con un lector
de pantalla.

| Estado | Qué significa | Qué puedes hacer |
|---|---|---|
| ✅ **Listo para generar** | Todas las comprobaciones pasan. | Generar. |
| 🔧 **Necesita ajustes** | Hay algo que conviene arreglar, pero no es un impedimento. | Arreglarlo, **o confirmar expresamente que quieres seguir**. |
| 👁 **Requiere revisión** | Falta algo que tienes que aportar tú. | Aportarlo. No se salva con una casilla. |
| ⛔ **Bloqueado** | Hay un requisito sin cumplir. | Cumplirlo. **Esto no se puede saltar**, ni desde la aplicación ni llamando a la API. |

Cada comprobación te dice **por qué** y **qué hacer**, y cuando se arregla en otra pantalla te lleva a ella con
un enlace («Ir a arreglarlo»).

## Bloqueado: los motivos y su solución

### «No tienes ninguna clave de KIE.ai guardada» · «Tu clave está marcada como no válida»

Generas con **tu** clave y pagas en **tu** cuenta del proveedor. Sin una clave utilizable no se encola nada,
porque nadie podría pagarlo. Se arregla en **«Tu cuenta»**: añade la clave, o pruébala y sustitúyela si el
proveedor la ha rechazado.

### «Esta instalación aún no puede pagar trabajos en …»

El modelo que has elegido es de un proveedor al que Escenara todavía no le puede pasar tu clave. Elige un modelo
de otro proveedor.

### ««Nombre» no se puede usar para generar todavía»

Es la puerta del consentimiento, y no se abre nunca sin arreglar el motivo. Puede ser:

- **falta registrar el consentimiento** de uso de imagen;
- **está revocado**: hay que registrar uno nuevo;
- **la revisión se ha rechazado**;
- **el consentimiento de un tercero espera la revisión** de quien administra la instalación;
- **faltan fotos de referencia**: hacen falta las que pida tu instalación (tres de fábrica).

Se arregla en la ficha del personaje.

### «El modelo … no acepta fotos de referencia»

Ese modelo no admite ninguna imagen de entrada, así que no se puede usar con un personaje. Elige otro modelo.

### «Este proyecto no tiene el plan aprobado»

Una escena solo se produce si su plan está aprobado. Aprueba el plan en la página del proyecto.

### «Necesitas … libres en la biblioteca»

El resultado tiene que caber **antes** de pagarlo: un clip que no cupiera se habría pagado ya. Vacía la papelera
o borra archivos.

### «Tu cuenta de … tiene N créditos y este trabajo necesita M»

Recarga créditos en el proveedor. Si el proveedor no contesta cuando le preguntamos tu saldo, **no se bloquea
nada**: preferimos que lo rechace él a impedirte generar porque su API de saldo falle.

### «Este trabajo necesita … y el tope por trabajo de esta instalación es de …»

Es un techo que pone quien administra, para que un accidente no te vacíe la cuenta. Pídele que lo suba, o elige
un modelo más barato.

### «Tu presupuesto en esta instalación tiene … libres»

Es tu presupuesto autorizado en Escenara. Si parte está **retenida** en trabajos a los que el proveedor no
contestó, el mensaje te lo dice con esas palabras: eso no se libera solo y lo resuelve quien administra, así que
esperar no serviría de nada.

### «Este proyecto tiene … autorizados y lleva … comprometidos»

El presupuesto del proyecto es un techo **al gastar**, no solo al aprobar. Súbelo o quita escenas. Cuenta también
lo que se haya gastado el asistente de guion en ese proyecto: es dinero del mismo bote.

## Requiere revisión: lo que tienes que aportar

### «Esta escena no está aprobada en el plan»

O nunca lo estuvo, o la editaste después de aprobar y su aprobación dejó de valer. El mensaje dice exactamente
qué cambió. Vuelve a aprobar el plan.

### «El precio del modelo ha cambiado» · «La ficha del personaje ha cambiado» · «La plantilla de prompt ha cambiado»

Aprobar un plan **congela** con qué se iba a generar: el modelo y su precio, la versión de la ficha de tu
personaje y la versión de la plantilla. Si alguna de las tres cambia, lo que aprobaste ya no es lo que se
enviaría ni lo que se pagaría. Revisa el plan y vuelve a aprobarlo.

### «Esta escena tiene N afirmaciones sin verificar»

El guion afirma cifras, datos, promesas de resultado o cosas de salud que conviene comprobar antes de publicar.
Escenara **no verifica nada por su cuenta**: en cada afirmación decides tú si la **verificas** (escribiendo de
dónde sale), la **corriges** o la **descartas**.

## Necesita ajustes: avisos que puedes salvar

Estos no te impiden generar, pero **hay que confirmarlos expresamente**: se marca la casilla «Lo he leído y
quiero generar igualmente» del aviso concreto. Tu confirmación viaja con el envío y **queda registrada** en la
evaluación, junto con las reglas que se aplicaron.

Confirmar un aviso distinto es otra confirmación: si cambias lo que has confirmado, el envío estrena su clave y
no reutiliza la anterior. Es la misma regla que con el coste: **lo que confirmas vale para lo que viste**.

### «El precio de … se comprobó hace más de 90 días»

Los proveedores cambian de tarifa. Con un precio viejo, la estimación puede quedarse corta. Pídele a quien
administra que lo vuelva a comprobar, o acepta la estimación tal cual.

### «Las referencias de «Nombre» no cubren todas las vistas recomendadas»

Faltan fotos de alguna vista mínima, o el control de calidad señaló alguna de las que hay. Con menos cobertura la
identidad se mantiene peor entre fotogramas. Añade las fotos que faltan en su ficha, o genera con las que hay.

> Este aviso **viene apagado de fábrica**: solo tiene sentido si tu instalación usa la captura guiada de vistas.
> Se enciende en Admin › Ajustes › Controles previos.

### «El modelo … no declara cuánto dura el clip»

Su precio no acota lo que va a costar, así que el trabajo se encola pero **no sale** hasta que le fijas un techo
de créditos. No hace falta confirmar nada aquí: fijar ese techo **es** la acción de este aviso.

## Lo que no se puede saltar, no se salta

Un **Bloqueado** no se puede confirmar de ninguna manera. Tampoco enviando su clave de regla a la API a mano: el
servidor ignora cualquier confirmación que llegue para un freno que no sea un aviso. Lo mismo vale para
**Requiere revisión**: ahí no hay casilla, hay algo que aportar.

## En el plan del proyecto

Cada escena del plan lleva su propio estado, y el plan muestra el **peor** de todos como estado global. Ahí solo
se comprueba lo que es propio de la escena (si su plan está aprobado, si su aprobación sigue en pie y si le quedan
afirmaciones por verificar): lo que depende del envío concreto —tu clave, tu saldo, el espacio y el presupuesto—
se comprueba al generar, porque hasta entonces no hay ni modelo elegido.

## Para quien administra

En **Admin › Ajustes › Controles previos** se ajustan los avisos:

- **avisar si el precio del modelo es antiguo** (encendido de fábrica);
- **avisar si faltan vistas del personaje** (apagado de fábrica);
- **cuántos avisos se pueden confirmar de una vez** (3 de fábrica): pasado ese número hay que arreglar algo, porque
  una pantalla con seis casillas de «sé lo que hago» no es una confirmación informada.

**Las reglas no se editan desde el panel.** Viven en el código, se revisan como código y tienen una **versión**
que queda guardada en cada evaluación: sin ella, «esto se bloqueó» no se podría reproducir meses después. Los
frenos duros —credencial, consentimiento, formato del modelo y presupuesto— no son configurables a propósito.
