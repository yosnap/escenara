# Tu primer vídeo

Guía para generar tu primer fotograma y tu primer clip en Escenara, desde el navegador y sin tocar código. Disponible a partir de la versión **0.10.0**.

## Antes de empezar

1. **Tu clave de KIE.ai.** Escenara no vende créditos ni usa una clave común: generas con tu propia cuenta y pagas al proveedor. Consigue la clave en [kie.ai/api-key](https://kie.ai/api-key) y guárdala en **Tu cuenta › Credenciales de IA**. Solo se guarda si la prueba pasa, y queda cifrada en el servidor: nadie, ni quien administra, puede volver a verla.
2. **Saldo de créditos en KIE.** Con los precios comprobados el 27 de septiembre de 2026, un fotograma cuesta 4 créditos y un clip de 4 s, 60. Unos 5 USD dan para unos 1.000 créditos.
3. **Una foto de la persona o el personaje.** Súbela a tu biblioteca o tenla a mano. Solo imágenes (JPEG, PNG, WebP, GIF o AVIF) de hasta 10 MB.

Si te falta la clave, `/crear` te lo dice y te lleva a la página de cuenta.

## Los cuatro pasos

### 1. Elige la imagen de referencia

En **Crear**, sube la foto, arrástrala o elígela de tu biblioteca. El modelo intentará mantener la cara, el pelo y los rasgos de esa imagen.

Marca la casilla **«tengo derecho a usar esta imagen»** cuando llegues al paso 3: es obligatoria y queda registrada en el trabajo con su fecha. Si la persona de la foto no eres tú, necesitas su permiso.

**Dónde va la imagen.** Para generar, Escenara sube la foto al almacenamiento temporal de KIE y le pasa ese enlace al modelo: durante unas horas el archivo es accesible para quien tenga la dirección, y después KIE lo borra. Tenlo en cuenta con fotos de otras personas. El archivo original sigue en tu biblioteca, en el almacenamiento de tu instalación.

### 2. Describe la escena

Di dónde está, qué hace y cómo se ve. Cuanto más concreto, mejor:

> En una cafetería luminosa, saluda a cámara con una sonrisa, luz natural de mediodía, aspecto de vídeo de móvil. Sin texto ni logotipos.

El fotograma sale vertical (9:16), el formato de Reels, TikTok y Shorts.

**Lo que dice, aparte.** Si quieres que el personaje hable, escribe la frase en el campo **«Lo que dice (opcional)»**, no en la descripción de la escena. Los modelos de imagen, si ven una frase en el prompt, la **dibujan** en el fotograma como subtítulo, bocadillo o rótulo (lo comprobamos generando de verdad con tres modelos distintos), y el clip lo hereda. Por eso el fotograma se genera solo con la descripción visual, y la frase se usa únicamente en el clip, que sí tiene voz.

### 3. Revisa el coste y confirma

El panel de coste es la zona clara de la pantalla y dice tres cosas:

- **los créditos estimados** del trabajo;
- **tu saldo** en KIE;
- **el equivalente aproximado en euros**, con la fuente del precio y la fecha en que se comprobó.

Es una estimación: el importe final lo informa el proveedor y Escenara lo guarda tal cual. Nada se envía hasta que pulsas **Generar fotograma** con la casilla de derechos marcada. Si el precio hubiera cambiado mientras revisabas, el envío se rechaza y vuelves a ver el coste nuevo antes de decidir.

Si un trabajo pasa del aviso configurado (200 créditos por defecto, ajustable en **Admin › Ajustes › Generación**), aparece una segunda casilla para aceptar expresamente ese gasto. Sigue siendo un aviso, no un tope: decides tú.

**Si se corta la conexión al enviar**, Escenara no te dirá que lo repitas sin más: te avisa de que puede haberse enviado y te manda al historial. Y si vuelves a pulsar el botón con la misma confirmación, el servidor reconoce que es la misma y te devuelve el trabajo que ya había creado, sin encargar otro.

### 4. Espera y mira el resultado

Verás el estado **real** que informa KIE, traducido: «en cola en el proveedor», «generando», «listo» o «ha fallado», con el tiempo transcurrido y Chispa haciéndote compañía. No hay barras de porcentaje porque el proveedor no informa de ningún porcentaje: preferimos decirte la verdad.

Puedes cerrar la página: el trabajo sigue en KIE, el servidor lo sigue consultando por su cuenta y, cuando termine, el archivo aparece en tu biblioteca y en **Crear › Historial** sin que tengas que hacer nada. Si vuelves al historial, lo que se quedó a medias se reconcilia al abrirlo.

Cuando esté listo, el archivo se descarga al momento (la URL del proveedor caduca) y se guarda en tu biblioteca. Se ve completo, en su proporción real: un vertical no se recorta ni en el resultado, ni en el historial, ni a pantalla completa.

## Animar el fotograma

Desde el fotograma listo, el botón **Animar 4 s** genera un clip vertical de 4 segundos a 720p usando ese fotograma como primer fotograma. Tiene su propia estimación y su propia confirmación: cada gasto se aprueba por separado. En esta versión la duración y el formato son fijos; se podrán elegir más adelante.

## Si algo va mal

- **«Sin respuesta del proveedor».** No hemos podido saber cómo va el trabajo. Escenara **no lo reenvía nunca**, porque podría cobrarse dos veces. Verás el identificador de la tarea en KIE y un botón **Volver a consultar**: púlsalo cuando quieras y, si la tarea terminó, se recuperan el archivo y los créditos consumidos.
- **«Ha fallado».** El proveedor no ha podido completar la generación. Prueba con otra descripción o con otra imagen.
- **Se ha generado pero no se ha guardado.** Suele ser falta de espacio en tu biblioteca. Vacía la papelera o borra archivos y pulsa **Volver a consultar**: se reintenta solo la descarga, nunca la generación.
- **«Tu saldo de KIE no llega».** Recarga créditos en el proveedor; Escenara no envía nada que no puedas pagar.
- **«Necesitas … libres en la biblioteca».** El espacio se comprueba antes de gastar, reservando el tamaño máximo que puede tener el archivo. Libera espacio y vuelve a intentarlo.
- **«Ya tienes trabajos en marcha».** Se admiten tres a la vez por usuario, para que un error no se convierta en una factura.

## Qué se guarda de cada generación

En tu historial queda: el modelo, el estado, la descripción, los créditos (los del proveedor si los informa, o la estimación marcada como tal), el archivo resultante y tu confirmación de derechos. Nada de esto lo ve otro usuario: los trabajos son privados, igual que la biblioteca.
