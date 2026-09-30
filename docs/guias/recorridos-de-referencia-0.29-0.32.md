# Recorridos de referencia · 0.29 a 0.32

Estos ejemplos permanecen en la cuenta de administración de la **base principal**. Abre cada proyecto para
ver la idea, los campos de la escena, el plan, el historial de trabajos y los medios que se conservan en la
biblioteca. Los importes de KIE son consumo observado, no una promesa de precio futuro. Las capturas muestran
la interfaz en el momento de la prueba; el proyecto guardado es la fuente para reproducir el recorrido.

| Fase | Referencia en la cuenta | Qué enseña | Estado |
|---|---|---|---|
| 0.29 | [Prueba de Elisa con audio sintetizado](/proyectos/11bf3d6d-2470-4a58-886c-0f6654c3c37d) y [segunda prueba con voz grabada](/proyectos/57498e74-3b24-452b-85ab-17e93ece79b7) | Audio, retrato vertical, derechos, coste y revisión de sincronía | Dos clips y MP4 guardados; 184 de 200 créditos medidos; revisión perceptiva de la segunda prueba pendiente |
| 0.30 | [Crema Aurora en dos escenas](/proyectos/4fb19dba-589e-4a90-b3b6-18fe19ee3479) y [plantillas en Admin › Plantillas](/admin/plantillas) | Producto físico, guion visual, vigencia, versiones y cambio de modelo | Dos clips y MP4 terminados; 96 créditos medidos |
| 0.31 | [Nora, ilustración plana](/proyectos/8ee8d990-e52e-4e08-ba58-52d71ac5b461), [Bruno, 3D](/proyectos/0a2604ce-96e7-4809-835e-b99de5d99fbf), [Mika, anime](/proyectos/8a6e31e0-20e5-417e-b8a3-73e190045571) | Retrato maestro, vistas, fotogramas y cuatro clips animados | Producidos; 196 créditos medidos |
| 0.32 | [Montaje de tres clips](/proyectos/78029792-b60f-4191-b2ca-9e7f6cc0455e/montaje) | Orden, recorte, música, subtítulos, etiqueta y MP4 | Exportado y descargado; cero créditos |

## 0.29 · Elisa y el audio de prueba

La **idea** del proyecto pedía que Elisa, personaje inventado de apariencia realista, interpretase a cámara una
melodía de 11,52 s sobre «la». El **concepto** recoge que el audio se sintetizó localmente, sin canción,
voz ni grabación de terceros. Al escucharlo, ese archivo suena a **sintetizador básico sin voz
cantada ni letra reconocible**. El archivo [audio original de la prueba](../assets/audio/0.29.0-melodia-original-la.mp3) es
MP3 mono de 48 kHz y 277.676 bytes. Sigue también en la biblioteca de la cuenta; el retrato frontal que encabeza
las referencias de Elisa mide 864 × 1080, por lo que es vertical.

La **escena** usa el formato «Cantar con tu audio», plano medio, ángulo frontal y cámara quieta. En «Lo que se
cuenta» se explica que la melodía y el ritmo proceden del archivo; en «Lo que se ve» se pide a Elisa mirando a
cámara, labios sincronizados, fondo crema y una sola toma sin cortes ni rótulos. La pantalla mide 12 segundos
facturables: **12 × 3 = 36 créditos** estimados inicialmente con InfiniteTalk a 480p y precio público del
29/09/2026. El presupuesto autorizado del proyecto es 200 créditos. El proveedor recibe el audio y la
descripción visual; la frase de la escena no sustituye la letra.

La prueba descubrió que la vista previa del canto decía «boca cerrada» y que su camino de producción omitía la
dirección elegida. Se corrigieron ambos antes de enviar el trabajo. La
[captura del proyecto preparado](../assets/capturas/0.29.0-elisa-canto-preparado.png) muestra el resumen ya
corregido, el audio seleccionado y la estimación.

La declaración de derechos se guarda **por audio**, con fecha y texto aceptado. Sin ella el servidor bloquea el
envío y no reserva créditos. Quien administra la confirmó para el MP3 original. **Dos intentos de InfiniteTalk**
acabaron en «Internal Error» del proveedor, ambos con **0 créditos cobrados**. Se mantuvieron en el historial.
El modelo alternativo **Kling AI Avatar Standard** exigió activar su ficha antigua descubierta en el catálogo
mediante la migración 0051; los ajustes del admin pasaron a Kling a 720p. La pantalla estimó **12 × 8 = 96
créditos**. El trabajo terminó y KIE comunicó **88 créditos realmente consumidos**, dentro de los 200
autorizados. La [captura del clip listo](../assets/capturas/0.29.0-elisa-canto-terminado.png) y la
[guía de canto](cantar-con-audio-propio.md) conservan el recorrido.

`ffprobe` midió el clip del proveedor: **H.264, 848 × 1072, AAC estéreo, 12,267 s**. La pista de audio coincide
con el MP3 aportado (PSNR de audio de 174 dB tras igualar frecuencia y canales). **Eso solo prueba que el audio
se incorporó al vídeo.** Al revisar el clip se observó que los labios **no guardan relación con lo
que suena**. Este intento no cumple el criterio de aceptación de canto ni valida el lip-sync; hay que repetir
la prueba con una grabación que contenga voz cantada clara. El proveedor conservó el rostro de
Elisa; **cambió el fondo crema pedido por una cafetería** y generó
[letras ilegibles al final](../assets/capturas/0.29.0-elisa-canto-artefacto-final.jpg). El
[fotograma inicial](../assets/capturas/0.29.0-elisa-canto-fotograma.jpg) permite compararlo. El clip fuente es
vertical, pero **no 9:16**; la vista previa ahora muestra sus dimensiones reales.

Se guardó además un [montaje del proyecto](/proyectos/11bf3d6d-2470-4a58-886c-0f6654c3c37d/montaje)
con etiqueta sintética arriba y exportación sin créditos. `ffprobe` confirma **H.264, 1080 × 1920, AAC estéreo,
12 s**, 5.353.327 bytes. FFmpeg conserva el encuadre completo con franjas negras arriba y abajo; no inventa
imagen lateral ni recorta la cara. Están la [captura de la exportación](../assets/capturas/0.29.0-elisa-montaje-exportado.png)
y un [fotograma del MP4 final](../assets/capturas/0.29.0-elisa-montaje-fotograma.jpg). Este ejemplo se conserva
como referencia del **flujo técnico y de un fallo de calidad**, pero no debe presentarse como demostración de
un personaje cantando. La repetición se realizó con una grabación vocal dentro de los **112 créditos** que
quedaban del límite de 200.

Se generó una [segunda escena con Elisa](/proyectos/57498e74-3b24-452b-85ab-17e93ece79b7) a partir de una
canción que quien administra confirmó como **composición y grabación originales de su estudio**. El archivo subido
dura 25,29 s; el límite de canto obligó a guardar en la biblioteca otro MP3 de **12 s, recortado entre los
segundos 8 y 20**, conservando el original. La idea explica la procedencia y el recorte; la escena guarda
plano medio frontal, cámara fija, la petición de fondo liso y ausencia de rótulos. Se declaró **música propia**
para el recorte y se confirmaron los derechos de la imagen de Elisa antes de generar. La pantalla estimó
**96 créditos** y KIE comunicó **96 consumidos**. Con el primer intento suman **184 de los 200 créditos**
autorizados; quedan 16. Las capturas de la [cola](../assets/capturas/0.29.0-elisa-voz-generando.png) y la
[producción terminada](../assets/capturas/0.29.0-elisa-voz-clip-listo.png) conservan el trabajo
y su resultado; el [montaje](../assets/capturas/0.29.0-elisa-voz-montaje-listo.png) guarda un fragmento de 12 s,
audio al 100 %, sin música adicional ni subtítulos y con la etiqueta de contenido sintético arriba. La
exportación no gastó créditos.

`ffprobe` midió el segundo clip de Kling: **H.264, 848 × 1072, AAC estéreo, 12,267 s**. Su audio coincide
técnicamente con el recorte elegido, pero esa medida **no demuestra sincronía labial**. El MP4 exportado mide
**4.841.075 bytes, H.264, 1080 × 1920, AAC estéreo y 12,011 s**. El
[fotograma del montaje](../assets/capturas/0.29.0-elisa-voz-montaje-fotograma.jpg) confirma que la etiqueta
aparece en el archivo final. Kling conservó el rostro de Elisa, pero volvió a generar una cafetería en vez del
fondo liso solicitado y añadió [texto amarillo ilegible](../assets/capturas/0.29.0-elisa-voz-fotograma-medio.jpg)
en el centro y [al final](../assets/capturas/0.29.0-elisa-voz-fotograma-final.jpg). La valoración perceptiva
de quien administra sobre la relación entre labios, sílabas y pausas sigue pendiente; hasta entonces este clip
documenta el flujo completo, pero **no valida el criterio de lip-sync**.

## 0.30 · Dos trends y cambio de modelo tras un fallo

Admin › Plantillas se inició con cinco formatos propios en estado **revisión**: unboxing en primera persona,
antes y después de una rutina, producto en la rutina de la mañana, ASMR con producto y giro del producto en la
mano. Cada tarjeta conserva su texto de servidor en inglés, variables tipadas, duración objetivo y número de
versión. Los formatos de unboxing y giro se activaron durante la prueba y volvieron a **revisión** al terminar,
igual que sus variantes de 5 s: la publicación queda a decisión de quien administra. Los otros tres no se han
probado y también siguen en revisión. La
[captura del catálogo](../assets/capturas/0.30.0-catalogo-trends-revision.png) muestra el estado inicial y la
[captura tras la prueba](../assets/capturas/0.30.0-trends-tras-prueba.png), las variantes guardadas.
La [guía de trends](trends-virales.md) explica cómo publicar, versionar, caducar y duplicar sin desplegar.

El proyecto de referencia de la cuenta tiene a **Elisa** como protagonista, presupuesto de **100 créditos** y
escenas inicialmente de **6 s**. La primera describe un unboxing en primera persona del tarro físico de **Crema de noche
Aurora**, con formato de voz en off sin diálogo, cámara quieta y acción de producto «Enseñarlo a cámara». La segunda pide
girar el mismo tarro hacia la cámara, con acercamiento sutil y acción «Enseñarlo a cámara». La idea, el concepto,
los campos y el producto quedan guardados. La
[captura del proyecto preparado](../assets/capturas/0.30.0-proyecto-dos-escenas-preparado.png) permite revisar
el estado anterior a la generación.

Se pagaron dos fotogramas de **4 créditos** cada uno. El primero mostró a Elisa desde fuera en vez de una vista
en primera persona; el segundo mostró bien el tarro en su mano. Hailuo 2.3 Standard advirtió que no puede recibir
la foto del producto como referencia y que la etiqueta podría cambiar. Tras confirmar el aviso, los dos clips
fallaron con «Internal Error» en KIE y **0 créditos cobrados**; una repetición del unboxing falló igual. Los
trabajos fallidos y sus entradas permanecen en el historial. La prueba corrigió la pantalla para mostrar el
aviso antes del envío y para repetir un clip sin rehacer el fotograma.

Para contrastar otro motor, se duplicaron ambos formatos en variantes de **5 s** restringidas a MiniMax H3, que
admite la foto del producto y cuesta **40 créditos medidos por clip**. Las plantillas originales de 6 s y sus
trabajos no se borraron. El proyecto y los textos de las escenas se actualizaron y se aprobó un plan de **88
créditos estimados**; se regeneraron dos fotogramas de 4 créditos cada uno para que coincidieran con la nueva
dirección. El nuevo fotograma del unboxing ya muestra las manos sacando el tarro de la caja. La
[captura de los dos nuevos fotogramas](../assets/capturas/0.30.0-dos-fotogramas-5s.png) permite compararlos
con el [primer encuadre](../assets/capturas/0.30.0-unboxing-fotograma-perspectiva.png).

Los dos clips de MiniMax H3 terminaron en **5 s** cada uno, a **40 créditos** por clip. Con los cuatro
fotogramas de 4 créditos, el consumo real del proyecto fue **96 de los 100 créditos autorizados**. El
[montaje guardado](/proyectos/4fb19dba-589e-4a90-b3b6-18fe19ee3479/montaje) une ambos clips y conserva la
etiqueta obligatoria. `ffprobe` comprobó su MP4: **H.264, 1080 × 1920, AAC estéreo, 10,013 s**, 4.560.808
bytes; el montaje no gastó créditos. Hay [captura de la exportación](../assets/capturas/0.30.0-montaje-dos-trends-listo.png)
y fotogramas del [unboxing](../assets/capturas/0.30.0-unboxing-exportado.jpg) y del
[giro](../assets/capturas/0.30.0-giro-exportado.jpg).

**Límites observados:** el unboxing muestra manos y caja, pero un mechón de Elisa asoma por el borde; no es
una perspectiva subjetiva perfecta. El tarro y su etiqueta se reconocen, aunque el texto fino de la marca
no queda fiel en todo el clip. El ejemplo sirve para enseñar el flujo y revisar la fidelidad antes de publicar;
si la rotulación exacta fuese imprescindible, habría que repetir con otro material o editar el plano. Los
fallos de Hailuo y los encuadres anteriores permanecen en el historial para comparar.

## 0.31 · Tres acabados con el mismo flujo

Los tres personajes son inventados. Cada ficha conserva una **descripción de identidad**, un **preset de
estilo**, paleta, trazo, detalle y referencias descriptivas originales. Se generó un retrato maestro, se aprobó
y se añadieron dos vistas generadas antes de producir. Los retratos y las generaciones anteriores siguen en la
biblioteca y en el historial. El trabajo de cuatro clips y sus referencias consumió **196 de los 200 créditos
autorizados**; no se inició una prueba de habla que rebasara ese límite.

| Personaje y proyecto | Criterio de continuidad | Escena, dirección y resultado | Créditos medidos |
|---|---|---|---:|
| Nora · ilustración plana | Pelo cobrizo con mechón blanco, tres pecas por mejilla, chaqueta mostaza con cuello azul, cuaderno coral; contorno regular y color mate | Plaza soleada: plano general frontal con seguimiento. Cafetería: plano medio a tres cuartos con acercamiento suave. Dos fotogramas y dos clips de 6 s sin diálogo | 96 |
| Bruno · 3D estilizado | Rizos oscuros, gafas naranjas, barba triangular y jersey verde con cremallera crema; material mate y volumen redondeado | Taller, caja azul y avión de papel amarillo; plano medio a tres cuartos, cámara quieta. Un fotograma y un clip de 6 s sin diálogo | 54 |
| Mika · anime original | Coleta azul noche, cinta amarilla, ceja derecha partida y chaqueta coral; línea definida y sombras de dos capas | Pasarela de estación, panel luminoso abstracto; plano general frontal con seguimiento. Un fotograma y un clip de 6 s sin diálogo | 46 |

La primera composición de los fotogramas de Nora introdujo **anclajes fotográficos** del método 6C. Produjo
dos imágenes con aspecto realista y se corrigió el compositor para separar los anclajes animados; los dos
fotogramas aprobados ahora son ilustrados. El historial conserva los intentos iniciales para explicar el
diagnóstico. En la escena guardada de Bruno aparece al final una descripción de sudadera turquesa que entra
en conflicto con la ficha; el fotograma y el clip siguen el **jersey verde** de su ficha. Conviene evitar
instrucciones contradictorias en ejemplos nuevos; aquí se conserva la entrada real para documentar el caso.

[Nora en dos clips](../assets/capturas/0.31.0-nora-dos-clips.png) ·
[Nora, escena 1](../assets/capturas/0.31.0-nora-escena-1.png) ·
[Nora, escena 2](../assets/capturas/0.31.0-nora-escena-2.png) ·
[Bruno](../assets/capturas/0.31.0-bruno-fotograma.png) ·
[Mika](../assets/capturas/0.31.0-mika-fotograma.png).

## 0.32 · Montaje guardado y exportación

El proyecto contiene tres escenas con clips locales de 6 s creados mediante `ffmpeg -f lavfi`, con tonos de
audio y subtítulos; no se llamó a ningún proveedor. Se reordenaron las escenas a **2, 1, 3**, se recortaron a
**4, 5 y 6 segundos** y se guardó la versión 2 del montaje. Música al 25 %, subtítulos quemados y etiqueta
obligatoria de contenido generado con IA arriba. La exportación `75cd574b-04ee-4614-b6a4-3651d9f87951`
se pidió dos veces y quedó una sola fila por montaje y versión.

Se descargó el MP4 y `ffprobe` midió **H.264, 1080 × 1920, AAC estéreo y 15,016 s**. Un fotograma muestra
la etiqueta y el subtítulo quemados. El SRT y el VTT también están conservados con la exportación. Esta
operación consumió **cero créditos**. Las capturas son [montaje](../assets/capturas/0.32.0-montaje-claro.webp),
[etiqueta obligatoria](../assets/capturas/0.32.0-etiqueta-obligatoria.webp) y
[exportación lista](../assets/capturas/0.32.0-exportacion-lista.webp).

La [guía de montaje](montaje-y-exportacion.md) recoge qué impide exportar y cómo resolverlo. La reproducción
real tras subirlo a TikTok, Reels y Shorts sigue siendo una comprobación de quien administra.
