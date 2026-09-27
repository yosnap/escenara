# El asistente de guion

Guía de uso · versión 0.17.0

En Escenara un vídeo empieza por un **proyecto**: una idea, un concepto, un guion por escenas y un **plan con su
coste estimado**. Puedes escribirlo todo a mano, o pedirle al asistente que te proponga un primer borrador. Lo
importante es lo mismo en los dos casos: **nada se genera hasta que apruebas el plan**, y el coste lo ves antes,
por escena y en total.

## Lo primero: el asistente es opcional

El asistente llama a un modelo de texto, y eso **cuesta créditos de tu cuenta del proveedor**. Por eso llega
apagado de fábrica. Si en tu instalación no está disponible, la página te dice por qué:

- «El asistente de guion está apagado en esta instalación»: quien la administra lo puede encender en
  Admin › Ajustes.
- «No hay ningún modelo disponible para esto en el catálogo»: además del interruptor hace falta un modelo de
  texto **probado** en Admin › Modelos. Se siembra uno, pero como «descubierto», que es el estado de lo que
  Escenara no ha ejecutado nunca: hasta que alguien lo ejecute y lo marque compatible con su precio medido, no se
  puede usar. Es a propósito: preferimos no estimar a ciegas.
- «El asistente escribe con tu propia clave de KIE»: añádela en «Tu cuenta». Pagas tú, en tu cuenta del proveedor,
  igual que al generar imágenes.

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
verás, en el panel neutro, **lo que va a costar**: los créditos estimados, la fecha del precio con el que se
calculó y el modelo que se usará. Se apunta en tu registro de gasto como cualquier otra llamada.

Lo que el asistente devuelve es **una propuesta**:

- sustituye las escenas que estén en borrador (si alguna ya está producida, no reescribe nada y te lo dice);
- no aprueba nada y no genera nada;
- viene limpio: aunque el modelo escriba «ignora las instrucciones anteriores» o intente colar un parámetro del
  proveedor, eso se quita antes de guardarlo. Lo que escriba es contenido para que tú lo revises, nunca una orden
  para Escenara.

De cada escena puedes cambiar:

- **lo que se cuenta o se dice** y **lo que se ve** (encuadre y acción, que es la base del fotograma);
- **la duración** en segundos;
El texto que se le envía al modelo **no se muestra y no se edita**: lo compone Escenara con tu escena, la
plantilla, los presets y la ficha de tu personaje, y va en inglés porque los modelos responden mejor. Tú decides el
qué; el cómo se escribe lo pone Escenara. Si tu instalación tiene la traducción encendida, lo que escribas en
español se traduce antes de generar (y eso cuesta unos créditos, que verás en el coste estimado); lo que **dice**
el personaje no se traduce nunca.

También puedes **reordenar** las escenas con las flechas (es el storyboard: mover una escena mueve el vídeo) y
**borrar** las que no quieras. Una escena ya producida no se borra: tiene un trabajo pagado detrás.

Si pulsas el asistente dos veces por error, la segunda no cobra: cada confirmación lleva su clave y la repetición
devuelve lo que ya había.

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

Abajo tienes la **tabla de aprobación**, en zona de claridad: sin colores de marca ni animaciones, porque es donde
decides gastarte un dinero. Muestra, por escena:

- los **modelos** con los que se generaría (el fotograma y el clip);
- la **duración**;
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

Aprobar **no genera nada**: autoriza. Producir las escenas aprobadas llega en una versión siguiente, y cuando
llegue pasará por esta misma puerta.

## Preguntas rápidas

**¿Quién ve mis proyectos?** Solo tú. Un proyecto de otra persona responde como si no existiera, y quien
administra la instalación **tampoco** los ve: un guion es trabajo privado.

**¿Qué pasa con lo que generé antes de esta versión?** Está agrupado en un proyecto «Sin título», con una escena
por trabajo. No se ha borrado ni cambiado nada.

**¿«Crear» sigue funcionando?** Sí, exactamente igual. Es el camino rápido para una imagen o un clip suelto.

**¿Cuánto cuesta el asistente?** Lo que diga el panel antes de pulsar, y se paga con tu clave. Al terminar, el
proveedor informa lo que ha costado de verdad y eso es lo que queda apuntado en tu gasto. Ese gasto **también
cuenta contra el presupuesto del proyecto** y se ve en la tabla del plan: es dinero del mismo bote.

**¿Por qué no veo el texto que se envía al modelo?** Porque el prompt lo compone Escenara y desde la 0.17.0 es
material del panel de administración. Lo que ves es lo que has elegido, de qué versión de tu ficha sale el
contexto, qué fotos se envían y lo que cuesta. Si necesitas saber qué se envió en un trabajo concreto, quien
administra tu instalación lo puede consultar.
