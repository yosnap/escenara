# Tu primer vídeo

Guía para generar tu primer fotograma y tu primer clip en Escenara, desde el navegador y sin tocar código. Disponible desde la versión **0.10.0** y puesta al día con la **0.36.0**.

![Flujo de Escenara: personaje, fotograma, clip, voz, montaje y exportación, con lo que cuesta cada paso](../assets/diagramas/flujo-general.svg)

## Antes de empezar

1. **Tu clave de KIE.ai.** Escenara no vende créditos ni usa una clave común: generas con tu propia cuenta y pagas al proveedor. Consigue la clave en [kie.ai/api-key](https://kie.ai/api-key) y guárdala en **Tu cuenta › Credenciales de IA**. Solo se guarda si la prueba pasa, y queda cifrada en el servidor: nadie, ni quien administra, puede volver a verla.
2. **Saldo de créditos en KIE.** Con los precios comprobados el 27 de septiembre de 2026, el fotograma por defecto cuesta 4 créditos y el clip por defecto de 4 s, 60. Unos 5 USD dan para unos 1.000 créditos. Si eliges otro modelo, el coste es el suyo y se muestra antes de confirmar.
3. **Una foto de la persona, o un personaje tuyo.** Súbela a tu biblioteca o tenla a mano; si ya tienes un personaje con su consentimiento y sus fotos, lo eliges en «Crear» y no hace falta ninguna foto suelta. También puedes partir de una imagen que ya tengas y pagar solo el clip. Solo imágenes (JPEG, PNG, WebP, GIF o AVIF) de hasta 10 MB.

Si te falta la clave, `/crear` te lo dice y te lleva a la página de cuenta.

## Los pasos de «Crear»

«Crear» va **de paso en paso**: arriba tienes una barra con los pasos numerados y el estado de cada uno (hecho, en curso, pendiente o bloqueado), y abajo los botones **Anterior** y **Siguiente**. Solo ves el paso en el que estás, así que no hay que bajar por una página larga. Puedes volver con un clic a cualquier paso que ya hayas hecho o visitado. Los que dependen de otro (el coste, el resultado y el clip) salen con un candado hasta que se pueden usar, y al pulsarlos te dicen qué falta. A un paso al que todavía no has llegado se avanza con **Siguiente**; si lo pulsas en la barra, te lo recuerda. Si el fotograma falla, el paso del clip te lo dice y el de coste vuelve a quedar pendiente: para pedir otro, cambia la descripción, la imagen o el modelo y confirma de nuevo (con la misma confirmación se te devuelve el mismo trabajo, para no cobrarte dos veces). Cambiar de paso no borra nada: lo escrito, lo elegido y un trabajo en marcha siguen ahí al volver.

El paso en el que estás queda en la dirección de la página (`?paso=`): al recargar o al compartir el enlace se abre ese mismo paso. Lo que no se ha generado ni guardado (por ejemplo, una descripción a medio escribir) no sobrevive a una recarga, como antes; si el paso pedido depende de algo que ya no está, se abre el paso con el que empieza «Crear» (el formato si hay trends que elegir; si no, el origen).

Los pasos son casi los mismos siempre, pero el camino que elijas al principio cambia cuáles salen en la barra. Cada opción de dirección (plano, cámara, gesto…) se explica en [Dirigir tu clip](dirigir-tu-clip.md).

### 1. Elige el formato

Lo primero es el formato del clip: la **plantilla normal** o uno de los **trends** vigentes de la instalación. Va antes que nada porque un trend decide si se puede hablar a cámara y la parte de la dirección que ya dicta su texto, y puede limitar la duración del clip (y con ella su coste); si no la limita, la eliges tú con el modelo. Con la plantilla normal, todo eso lo decides tú más adelante. Si la instalación solo tiene una plantilla para el clip, no hay nada que decidir y este paso no sale en la barra (los demás se numeran desde el 1). Si tiene varias pero ningún trend publicado, «Crear» se abre directamente en «¿De dónde sale el clip?» y este paso te dice por qué no hay trends. Cómo funcionan los trends está en [Usar y administrar trends](trends-virales.md).

### 2. ¿De dónde sale el clip?

Después eliges entre dos caminos:

- **Crear un fotograma nuevo**: eliges a quién sale y qué está haciendo, y se genera su imagen. Se paga el fotograma y, después, el clip. Es el camino que sigue el resto de esta guía.
- **Usar una imagen que ya tengo**: un fotograma de otro día, una vista de tu personaje o una foto tuya. No se genera ni se paga ningún fotograma: tras elegir la imagen («Elige la imagen de partida») pasas directamente al paso **«El clip»**, y la barra solo tiene esos cuatro pasos (formato, origen, imagen y clip).

### 3. Elige a quién generas

Es el paso «Elige a quién generas»: un personaje tuyo, o una imagen suelta que subes, arrastras o eliges de tu biblioteca. El modelo intentará mantener la cara, el pelo y los rasgos. Si no eliges ninguna de las dos, la escena se genera solo con tu descripción, con un modelo de texto a imagen (otro modelo y otro precio, y la pantalla lo dice).

Tienes que marcar la casilla **«En estas fotos no aparece ninguna otra persona ni ningún menor»**.

**Puedes elegir el modelo.** Debajo de la imagen aparece el modelo del fotograma, y junto al clip el de la animación, con sus créditos y su estado. Solo salen los que esta instalación ha probado de verdad: los marcados como **validado** están además revisados por quien administra. Al cambiar de modelo, el coste estimado se vuelve a calcular.

Marca la casilla **«Tengo derecho a usar esta imagen»** cuando llegues a «Revisa el coste y confirma»: es obligatoria y queda registrada en el trabajo con su fecha. Si la persona de la foto no eres tú, necesitas su permiso.

**Dónde va la imagen.** Para generar, Escenara sube la foto al almacenamiento temporal de KIE y le pasa ese enlace al modelo: durante unas horas el archivo es accesible para quien tenga la dirección, y después KIE lo borra. Tenlo en cuenta con fotos de otras personas. El archivo original sigue en tu biblioteca, en el almacenamiento de tu instalación.

### 4. Describe la escena

Di dónde está, qué hace y cómo se ve. Cuanto más concreto, mejor:

> En una cafetería luminosa, saluda a cámara con una sonrisa, luz natural de mediodía, aspecto de vídeo de móvil. Sin texto ni logotipos.

El fotograma sale vertical (9:16), el formato de Reels, TikTok y Shorts.

**Lo que dice, aparte.** Si quieres que el personaje hable, escribe la frase en el campo **«Lo que dice (opcional)»**, no en la descripción de la escena. Si el modelo de clip que has elegido no genera voz, Escenara te lo dice y ese campo no se usa: para que hable, elige un modelo con voz. Los modelos de imagen, si ven una frase en el prompt, la **dibujan** en el fotograma como subtítulo, bocadillo o rótulo (lo comprobamos generando de verdad con tres modelos distintos), y el clip lo hereda. Por eso el fotograma se genera solo con la descripción visual, y la frase se usa únicamente en el clip, que sí tiene voz.

### 5. Revisa el coste y confirma

Si falta algo para poder generar, arriba del paso sale una **alerta de bloqueo** con el título **«Antes de generar, falta:»**: borde rojo completo, el rótulo «Bloqueo» y cada punto numerado y como botón, con el primero destacado. Al pulsar un punto, o **«Ir al primero»**, «Crear» cambia al paso que toca, te lleva al campo o a la casilla, le da el foco, lo rodea con un aro del color de la marca y le pone encima una **flecha que rebota** señalándolo. La flecha y el aro se quitan a los pocos segundos, en cuanto tocas el campo o al pulsar en otro sitio. Con el movimiento reducido en tu sistema, la página salta sin desplazamiento suave, la flecha no se mueve y el aro no late. Al abrir un paso no hay nada en rojo; el campo o la casilla pendiente se marca con un aro rojo completo y, debajo, lo que falta, cuando sales del paso, pulsas un punto del bloque o pulsas el botón de generar con algo pendiente (el botón no envía nada mientras falte algo: te lleva al primero). En la barra de pasos, el paso con requisitos pendientes muestra cuántos faltan. Todo esto solo señala: los requisitos y el botón de generar son los mismos de siempre.

El panel de coste es la zona clara de la pantalla y dice tres cosas:

- **los créditos estimados** del trabajo;
- **tu saldo** en KIE;
- **el equivalente aproximado en euros**, con la fuente del precio y la fecha en que se comprobó.

Es una estimación: el importe final lo informa el proveedor y Escenara lo guarda tal cual. Nada se envía hasta que pulsas **Generar fotograma** con la casilla de derechos marcada. Si el precio hubiera cambiado mientras revisabas, el envío se rechaza y vuelves a ver el coste nuevo antes de decidir.

Si un trabajo pasa del aviso configurado (200 créditos por defecto, ajustable en **Admin › Ajustes › Generación**), aparece una segunda casilla para aceptar expresamente ese gasto. Sigue siendo un aviso, no un tope: decides tú.

**Si se corta la conexión al enviar**, Escenara no te dirá que lo repitas sin más: te avisa de que puede haberse enviado y te manda al historial. Y si vuelves a pulsar el botón con la misma confirmación, el servidor reconoce que es la misma y te devuelve el trabajo que ya había creado, sin encargar otro.

### 6. Espera y mira el resultado

Al pulsar **Generar fotograma**, la pantalla pasa sola a este paso, «Resultado del fotograma».

Verás el estado **real** que informa KIE, traducido: «en cola en el proveedor», «generando», «listo» o «ha fallado», con el tiempo transcurrido y Chispa haciéndote compañía. No hay barras de porcentaje porque el proveedor no informa de ningún porcentaje: preferimos decirte la verdad.

Puedes cerrar la página: el trabajo sigue en KIE, el servidor lo sigue consultando por su cuenta y, cuando termine, el archivo aparece en tu biblioteca y en **Crear › Historial** sin que tengas que hacer nada. Si vuelves al historial, lo que se quedó a medias se reconcilia al abrirlo.

Cuando esté listo, el archivo se descarga al momento (la URL del proveedor caduca) y se guarda en tu biblioteca. Se ve completo, en su proporción real: un vertical no se recorta ni en el resultado, ni en el historial, ni a pantalla completa.

## Animar el fotograma

Cuando el fotograma está listo (o desde la imagen que has traído), pulsa **«Siguiente: Clip»**: el paso **«El clip»** genera un clip vertical usando esa imagen como primer fotograma. Ahí eliges el modelo del clip, su **duración** entre las que ese modelo sabe cobrar (y, si el trend las limita, entre las que admite), lo que dice el personaje y la dirección con botones (plano, ángulo, movimiento de cámara, gesto…) y los botones que pida la plantilla o el [trend](trends-virales.md) que elegiste en el paso 1, «Elige el formato» (aquí ya no se vuelve a elegir). Lo que decida el trend de la dirección sale bloqueado con el motivo «Lo decide el trend». Si vienes con una imagen tuya no hay paso «Describe la escena», así que el texto que pida el trend (por ejemplo «Qué ocurre en la escena») se escribe aquí mismo, en un campo con el nombre que le da el trend; es la misma descripción que se escribe en el paso de la escena cuando lo hay, nunca dos textos distintos. La proporción es 9:16 y el clip sale a 720p. Pulsas **Animar**, con su propia estimación y su propia confirmación: cada gasto se aprueba por separado.

## Y después: seguir en un proyecto

Un clip de Crear se queda en tu biblioteca, pero no se puede montar ni ponerle voz en off por sí solo. Debajo del clip
terminado está **Convertir en proyecto**: crea un proyecto de una escena que **reutiliza ese mismo clip**, sin
generarlo otra vez y **sin cobrar nada**, con su imagen de partida, su trend, su dirección, su producto y su personaje.
Desde ahí puedes quitarle la voz que trae, ponerle voz en off y montarlo. Todo el recorrido está en
[De Crear a un proyecto](de-crear-a-un-proyecto.md).

## Si algo va mal

- **«Sin respuesta del proveedor».** No hemos podido saber cómo va el trabajo. Escenara **no lo reenvía nunca**, porque podría cobrarse dos veces. Verás el identificador de la tarea en KIE y un botón **Volver a consultar**: púlsalo cuando quieras y, si la tarea terminó, se recuperan el archivo y los créditos consumidos.
- **«Ha fallado».** El proveedor no ha podido completar la generación. Prueba con otra descripción o con otra imagen.
- **Se ha generado pero no se ha guardado.** Suele ser falta de espacio en tu biblioteca. Vacía la papelera o borra archivos y pulsa **Volver a consultar**: se reintenta solo la descarga, nunca la generación.
- **«Tu cuenta de KIE.ai tiene N créditos y este trabajo necesita M».** Recarga créditos en el proveedor; Escenara no envía nada que no puedas pagar. (Al generar las vistas de un personaje, el mismo aviso se lee «Tu saldo de KIE no llega para…».)
- **«Necesitas … libres en la biblioteca».** El espacio se comprueba antes de gastar, reservando el tamaño máximo que puede tener el archivo. Libera espacio y vuelve a intentarlo.
- **«Ya tienes N trabajos en marcha, que es el máximo de esta instalación».** De fábrica se admiten tres a la vez por usuario, para que un error no se convierta en una factura. Espera a que terminen antes de pedir otro.
- Otros motivos por los que un botón no se activa, con su solución, están en [Por qué no puedo generar](por-que-no-puedo-generar.md).

## Qué se guarda de cada generación

En tu historial queda: el modelo, el estado, la descripción, los créditos (los del proveedor si los informa, o la estimación marcada como tal), el archivo resultante y tu confirmación de derechos. Nada de esto lo ve otro usuario: los trabajos son privados, igual que la biblioteca.
