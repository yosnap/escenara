# El asistente de guion

Guía de uso · puesta al día en la versión 0.56.1

En Escenara un vídeo empieza por un **proyecto**: una idea, un concepto, un guion por escenas y un **plan con su
coste estimado**. Puedes escribirlo todo a mano, o pedirle al asistente que te proponga un primer borrador. Lo
importante es lo mismo en los dos casos: **nada se genera hasta que apruebas el plan**, y el coste lo ves antes,
por escena y en total.

Desde la 0.33.0 la página del proyecto va **de paso en paso**, con una barra arriba: **Brief** → **Idea** →
**Escenas** → **Aprobación**, cada uno con su estado (hecho, en curso, pendiente o bloqueado) y los botones
**Anterior** y **Siguiente** abajo. Solo ves el paso en el que estás. El proyecto se abre donde está el trabajo
(en la aprobación si el plan ya está aprobado, en las escenas si ya hay guion, etcétera), y el paso queda en la
dirección (`?paso=`) para volver a él al recargar o compartir el enlace. La aprobación está bloqueada, con su
motivo, mientras el guion no tenga ninguna escena. Cambiar de paso no pierde nada: una escena abierta a medio
editar o un orden de escenas sin guardar siguen igual al volver. Eso sí, **mientras haya cambios sin guardar en
«Escenas»** (el orden o una escena editada), ese paso sale «en curso» y el de aprobación te lo dice y no deja aprobar:
aprobarías el guion guardado, no el que estás viendo. Guárdalos o descártalos (cada escena editada tiene su botón
«Descartar cambios»).

## Lo primero: el asistente es opcional

El asistente llama a un modelo de texto, y eso **cuesta**: créditos de tu cuenta del proveedor o, si usas un servicio
que se paga por cuota de tu plan, esa cuota. Por eso llega apagado de fábrica. Si en tu instalación no está
disponible, la página te dice por qué:

- «El asistente de guion está apagado en esta instalación»: quien la administra lo puede encender en
  Admin › Ajustes.
- «Tu mapa de modelos de texto no tiene ninguna entrada utilizable»: revisa ese mapa en «Tu cuenta». Lo normal es que
  falte la clave del proveedor que elegiste, o que el modelo de pago que pusiste primero no tenga precio registrado
  en esta instalación. Es a propósito: preferimos no estimar a ciegas.

**El guion se pide con tu mapa de modelos de texto**: se usa el primero de la lista y, si falla de una manera que
prueba que no te cobró, se pasa solo al siguiente. Desde la 0.56.1, **el coste que ves y confirmas es el de ese
primero**, que es el que va a escribir, más una llamada de reserva aparte al precio de la entrada de pago más cara que
tengas detrás. Cómo ordenarlo está en [Con qué se genera cada cosa](mapa-de-modelos.md).

Sin asistente **no te falta nada**: escribir el guion a mano es el camino normal, no un apaño.

## 1 · Crear el proyecto

En «Proyectos» → «Nuevo proyecto»:

- **Título**: para reconocerlo en la lista.
- **Formato**: reel vertical, corto, anuncio o explicativo. Decide cuántas escenas se proponen y qué se le pide al
  asistente.
- **Idea**: qué quieres contar, en tus palabras. Es lo único que el asistente recibe, junto con el formato y (si lo
  eliges) la ficha de tu protagonista.
- **Presupuesto autorizado del proyecto**: el techo de créditos que autorizas para este proyecto. **Sin él no se
  puede aprobar el plan.** Se propone el valor que haya configurado quien administra.
- **Protagonista** (opcional): un personaje tuyo que pueda generar, es decir, con su consentimiento vigente y sus
  fotos mínimas. Su ficha entra en el contexto, igual que en «Crear».

Crear un proyecto **no cuesta nada**: no llama a ningún proveedor y no reserva presupuesto.

## 2 · El guion

Puedes añadir escenas a mano con «Añadir escena», o pulsar «Escribir el guion con el asistente». Antes de pulsarlo
verás, en el panel neutro, **lo que va a costar**: los créditos estimados y la fecha del precio con el que se
calculó. Si el primero de tu mapa es un servicio que se paga por la cuota de tu plan, verás «Por la cuota de tu plan
en …» con el nombre del servicio en lugar de una cifra y, si detrás tienes una entrada de pago, «si falla, como mucho
N créditos de reserva». Sin ninguna entrada de pago, «no cuesta créditos». Se apunta en tu registro de gasto como
cualquier otra llamada.

**La reserva, por si tu servicio se satura.** Los servicios de cuota a veces piden esperar o se quedan sin cuota un
rato. Si pasa, escribe tu reserva de pago y se te avisa de quién lo escribió y cuánto costó. Si no hace falta, no se
gasta.

**Nunca se cobra más de lo que confirmas.** Una entrada de pago solo escribe si lo que cuesta cabe en lo que queda de lo
confirmado. Si no cabe, no se llama: se para y se te dice cuál era, cuánto costaría, cuánto quedaba y que no se ha
cobrado nada. Si el precio de esa reserva cambia entre que lo ves y pulsas, se te pide confirmar de nuevo con el
vigente.

Lo que el asistente devuelve es **una propuesta**:

- sustituye las escenas que estén en borrador (si alguna ya está producida, no reescribe nada y te lo dice);
- no aprueba nada y no genera nada;
- viene limpio: aunque el modelo escriba «ignora las instrucciones anteriores» o intente colar un parámetro del
  proveedor, eso se quita antes de guardarlo. Lo que escriba es contenido para que tú lo revises, nunca una orden
  para Escenara.

De cada escena puedes cambiar **lo que se cuenta o se dice** y **lo que se ve** (encuadre y acción, que es la base
del fotograma). La **duración** no se cambia escena a escena: se elige una vez para todo el proyecto, en el paso «La
idea», con el selector «Duración de cada clip», y el asistente propone escenas de esa duración exacta. Las
duraciones que se ofrecen son **8, 6, 5 y 4 segundos** (8 s de fábrica), y la que elijas tiene que admitirla tu
modelo de vídeo. No siempre cuestan lo mismo: con Veo, 4 s y 8 s cobran igual, pero otros modelos cobran distinto
(el de 6 s, por ejemplo, tiene su propio precio medido). Revisa el coste en el plan antes de producir.

El texto que se le envía al modelo **no se muestra y no se edita**: lo compone Escenara con tu escena, la
plantilla, los presets y la ficha de tu personaje, y va en inglés porque los modelos responden mejor. Tú decides el
qué; el cómo se escribe lo pone Escenara. Si tu instalación tiene la traducción encendida, lo que escribas en
español se traduce antes de generar (y eso cuesta unos créditos, que verás en el coste estimado); lo que **dice**
el personaje no se traduce nunca.

También puedes **reordenar** las escenas arrastrándolas por su asa, con el teclado (Espacio para cogerla, flechas para
moverla, Espacio para soltarla) o con las flechas de cada escena (es el storyboard: mover una escena mueve el vídeo).
**El orden no se guarda al soltar**: aparece «Orden sin guardar» con **Guardar orden** y **Descartar**, como en el
montaje, y antes de guardar el aviso te dice qué cambia. Reordenar no quita la aprobación de ninguna escena ni repite
ni cobra nada, y los clips ya producidos se quedan como están; cambian los números de escena, cuál abre el vídeo y el
orden que se propone al montar (un montaje ya guardado mantiene el suyo). El gancho del anuncio está escrito en el
texto de la escena que era la primera y **no se traslada**: si la mueves, el vídeo deja de abrir con él. Si borras una
escena mientras el orden está pendiente, el orden de las que quedan se conserva. Y puedes **borrar** las que no
quieras. Una escena ya producida no se borra: tiene un trabajo pagado detrás.

Si pulsas el asistente dos veces por error, la segunda no cobra: cada confirmación lleva su clave y la repetición
devuelve lo que ya había.

## 2 bis · Un vídeo completo desde tu idea

Desde la 0.55.0 el asistente puede escribir **el guion entero de un vídeo**, con el diálogo de principio a fin y un
clip por escena. En el panel del asistente, en «Duración del vídeo», elige **Vídeo completo de 20 s** en lugar de
«Escenas sueltas» (que sigue siendo lo de siempre). Después eliges el tipo:

- **Una persona**: tu protagonista presenta o cuenta algo a cámara. Son **2 clips de 10 s**.
- **Entrevista**: tu protagonista y otro personaje tuyo, los dos en el mismo plano, conversando. Son **2 clips de
  10 s**, cada uno con su intercambio de frases.
- **Podcast**: los dos en plano y contraplano, cada clip enseña a quien habla. Son **3 clips de 8, 6 y 6 s**: ida,
  vuelta y cierre.

En la entrevista y el podcast eliges también **con quién habla** tu protagonista. Los dos tienen que ser personajes
tuyos que puedan generar (consentimiento vigente y fotos), porque su ficha sale hacia el modelo de texto.

Para que se ofrezca hace falta que el proyecto tenga **protagonista** y esté en el modo de voz **«Voz e identidad
registradas»**, que es con el que se producen estos clips. Si falta algo, la opción sale desactivada y te dice qué.

**Lo que cuesta, antes de empezar.** El recuadro neutro enseña las llamadas de texto que se van a hacer (una para
20 s), **una llamada de reserva aparte** y el total que confirmas, con la fecha del precio. La reserva se cobra, como
mucho, a lo que cueste la más cara de tu primera opción y tu reserva de pago. Solo se gasta si un trozo del guion llega
cortado o con frases que no caben en sus segundos (entonces se repite **solo ese trozo**, una vez y con la causa), o
si falla tu primera opción y escribe tu reserva de pago. Si no hace falta, no se gasta. Antes de cada llamada se suma lo ya cobrado: si la siguiente
pudiera pasar del total confirmado (porque el proveedor cobró alguna más cara de lo estimado), no se hace, se para y
se te dice cuánto ha costado lo hecho. Si el primero de tu mapa de texto va por la cuota de tu plan, el recuadro dice
«Por la cuota de tu plan en …» y, si tienes reserva de pago, cuánto podría costar como mucho. El coste de los clips se
enseña aparte, antes de producir.

**Las frases caben en su clip.** Se piden a unas 2,5 palabras por segundo: como mucho 25 palabras en un clip de
10 s, 20 en uno de 8 s y 15 en uno de 6 s. Un clip que se pase no se recorta a medias: se pide otra vez. El diálogo
se escribe en español de España y se guarda **tal cual**, sin traducir.

**Si algo falla, no se queda a medias.** El guion se guarda entero al final. Si el proveedor no contesta, o el
trozo repetido tampoco sirve, el aviso te dice qué parte falló, qué proveedor contestó, cuánto han costado las
llamadas ya hechas y qué hacer; tus escenas siguen como estaban.

**Ver y editar el diálogo.** El diálogo va plegado: en el paso «Escenas» ves un resumen (cuántos clips y cuánto
dura) y el plegable **«Ver y editar el diálogo»**. Dentro están las escenas normales, cada una con su texto, su plano
y su acción, y en la entrevista con su reparto y sus turnos; las cambias igual que un guion escrito a mano. Si dejas
cambios sin guardar, el plegable no se cierra hasta que los guardes o los descartes. Escribirlo ajusta la duración de clip del proyecto a la del primer clip (10 s
en una persona y entrevista, 8 s en podcast) y cada escena guarda la suya.

Los vídeos de **≈ 1 minuto** (8 clips de 8 s) y **≈ 3 minutos** (23 clips de 8 s) están preparados pero **no se
ofrecen** mientras quien administra no los abra en Admin › Ajustes («Vídeo completo de 1 y 3 minutos»). Su guion se
escribe en partes: primero un plan corto con el concepto, el vestuario, el lugar y el objetivo de cada parte, y
después cada parte de hasta 8 clips sabiendo cómo terminó la anterior, para que la conversación siga sin repetirse.

**La misma ropa y el mismo sitio en todos los clips.** Desde la 0.56.0 el guion completo guarda también el
**vestuario fijo** de cada personaje y el **lugar y la luz** del vídeo (en la de 20 s salen en la misma llamada, sin
coste de más). No se enseñan: se repiten tal cual en cada clip para que la ropa y el sitio no cambien entre cortes. Si
el proyecto tiene un [lugar](lugares.md), manda el lugar. Con lugar, en **Producción** aparece además el panel
**Planos base**: un fotograma por personaje, ya en el lugar y con su ropa, del que arrancan todos sus clips. Cuesta lo
que un fotograma por plano, se confirma una vez por el total y lo das por bueno tú con **Usarlo en sus escenas**. En
una persona hay un plano; en un podcast, uno por personaje; en una entrevista, ninguno (los dos comparten plano y la
continuidad la dan la identidad registrada y el lugar descrito). Antes de pedirlos se registra con su voz, sin coste,
a quien no lo esté. Mientras quien administra no encienda el ajuste de los vídeos completos (ver
[Administración](administracion.md)), el plano base queda preparado pero los clips no arrancan de él.

## 3 · Las afirmaciones por verificar

Escenara **lee tu guion** y señala las frases que conviene comprobar antes de publicar: cifras, cosas presentadas
como hechos («está demostrado que…»), promesas de salud y resultados prometidos. Lo hace leyendo el texto, **sin
llamar a ningún modelo y sin gastar un solo crédito**, así que también funciona con el guion que escribes tú.

De cada una decides:

- **Verificar**: la das por buena. Hay que **escribir la fuente**; una verificación sin fuente no se puede revisar
  dentro de seis meses.
- **Corregir**: vas a reescribir la frase. Apunta en la fuente qué cambias y por qué.
- **Descartar**: no aplica.

Escenara **no comprueba si son ciertas**: eso lo decides tú. Y hay un caso que **bloquea la aprobación**: una
afirmación sobre **salud** sin revisar. No se puede aprobar un plan que promete resultados de salud sin que una
persona lo haya mirado.

## 4 · El plan y su coste

En este paso tienes la **tabla de aprobación**, en zona de claridad: sin colores de marca ni animaciones, porque es donde
decides gastarte un dinero. Muestra, por escena:

- los **modelos** con los que se generaría (el fotograma y el clip);
- la **duración** del clip, que es la del proyecto;
- el **coste estimado**, siempre con la palabra «estimación» y **la fecha del precio** usado.

Y debajo, el **total estimado del proyecto** y tu **presupuesto autorizado**.

Dos cosas que conviene entender:

- **Es una estimación, no un precio.** El importe final lo decide el proveedor. Escenara solo calcula con el
  precio que tiene registrado, y te dice de cuándo es.
- **Puede llevar margen.** Si alguno de los modelos todavía no tiene el coste medido y revisado en esta
  instalación, la estimación se sube un porcentaje prudente y se te dice cuánto. Preferimos que sobre.

Si una escena aparece sin coste («Sin precio registrado»), no se puede estimar ni producir, y el plan entero no se
puede aprobar hasta resolverlo.

## 5 · Aprobar

«Aprobar el plan» está **deshabilitado mientras falte algo**, y lo que falta está escrito justo encima. Los
casos habituales:

- **falta el presupuesto** del proyecto, o el total —contando lo que ya se ha gastado el asistente— se pasa de él:
  súbelo o quita escenas. Ese presupuesto es un **techo de verdad**: si más tarde se produce una escena y lo que
  llevas comprometido más esa escena no cabe, no se envía y se te dice;
- **hay una afirmación de salud sin revisar**;
- **hay una escena sin precio registrado**;
- el proyecto **no tiene escenas** todavía.

Al aprobar, cada escena **congela** con qué se iba a generar: el modelo, el precio (su sello), la versión de la
ficha de tu personaje y la versión de la plantilla. Eso es lo que hace que la aprobación signifique algo.

**Y si después editas una escena, su aprobación deja de valer.** La tarjeta te lo dice con esas palabras y el
proyecto vuelve a «Borrador»: revisas el coste y vuelves a aprobar. No es una molestia gratuita: lo que aprobaste
ya no es lo que se enviaría. Reordenar o borrar escenas **no** invalida las demás, porque no cambia lo que
costarían.

Aprobar **no genera nada**: autoriza. Producir las escenas aprobadas ya se puede hacer, desde el botón
**«Producir las escenas»** de la página del proyecto, y pasa por esta misma puerta: lo cuenta
[Producir tu proyecto, escena a escena](producir-tu-proyecto.md).

## Preguntas rápidas

**¿Quién ve mis proyectos?** Solo tú. Un proyecto de otra persona responde como si no existiera, y quien
administra la instalación **tampoco** los ve: un guion es trabajo privado.

**¿Qué pasa con lo que generé antes de esta versión?** Está agrupado en un proyecto «Sin título», con una escena
por trabajo. No se ha borrado ni cambiado nada.

**¿«Crear» sigue funcionando?** Sí. Es el camino rápido para una imagen o un clip suelto, y hoy empieza por elegir
de dónde sale el clip; mira [Tu primer vídeo](tu-primer-video.md) y [Dirigir tu clip](dirigir-tu-clip.md).

**¿Cuánto cuesta el asistente?** Lo que diga el panel antes de pulsar, y se paga con tu clave (o con la cuota de tu
plan, si el primero de tu mapa es un servicio de cuota). Al terminar, el
proveedor informa lo que ha costado de verdad y eso es lo que queda apuntado en tu gasto. Ese gasto **también
cuenta contra el presupuesto del proyecto** y se ve en la tabla del plan: es dinero del mismo bote.

**¿Por qué no veo el texto que se envía al modelo?** Porque el prompt lo compone Escenara y desde la 0.17.0 es
material del panel de administración. Lo que ves es lo que has elegido, de qué versión de tu ficha sale el
contexto, qué fotos se envían y lo que cuesta. Si necesitas saber qué se envió en un trabajo concreto, quien
administra tu instalación lo puede consultar.
