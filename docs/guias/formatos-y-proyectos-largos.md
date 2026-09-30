# Formatos y proyectos largos

Desde la 0.41.0 un proyecto ya no es solo un reel vertical corto: eliges **para qué es la pieza**, el mismo montaje
sale en **9:16, 4:5, 1:1 y 16:9**, un proyecto puede tener hasta **30 escenas y 5 minutos**, y cada escena guarda
**todas las versiones** de su clip para que elijas cuál entra en el vídeo.

Lo más importante, antes de nada:

- **Sacar otro formato no cuesta créditos ni vuelve a generar nada.** Los formatos que no son el principal salen del
  mismo clip con un reencuadre que hace FFmpeg en la máquina donde está instalada Escenara.
- **Regenerar sí cuesta**, como siempre: solo se hace si tú lo pides, con su coste delante y tu confirmación.
- **Las versiones ocupan espacio** de tu biblioteca. Se conservan todas mientras el proyecto exista.

## 1. Para qué es la pieza

Al crear un proyecto eliges **«¿Para qué es?»** entre cuatro opciones, con el nombre de la plataforma y la
proporción:

| Opción | Proporción | Exporta a |
|---|---|---|
| **Reels · TikTok · Stories (9:16)** | Vertical | 1080 × 1920 |
| **Instagram feed y carrusel (4:5)** | Vertical corto | 1080 × 1350 |
| **Cuadrado (1:1)** | Cuadrado | 1080 × 1080 |
| **YouTube · horizontal (16:9)** | Apaisado | 1920 × 1080 |

Ese es el **formato principal**: la proporción en la que se le piden los fotogramas y los clips al modelo. Los demás
los sacas después en el montaje.

En **Crear** es la familia **Formato** de la botonera, con los mismos nombres. Desde esta versión la proporción que
eliges **se envía de verdad** al proveedor y queda apuntada en el trabajo: la ves en el historial como «Formato
16:9».

### Lo que tu modelo no admite, no se ofrece

Cada modelo del catálogo tiene apuntadas las proporciones que acepta. Un formato que el modelo elegido no admite
sale **deshabilitado con el motivo** («Nano Banana 2 Lite solo admite 9:16»), y si alguien lo pidiera por la API, el
servidor lo rechaza **antes de reservar nada**: no se encola, no se cobra.

Hoy el catálogo sembrado declara **9:16** en sus modelos, así que en una instalación recién puesta el resto sale
deshabilitado. Es honesto: el catálogo solo apunta lo que se ha comprobado generando. Cuando un modelo declare 16:9
o 1:1, esas opciones se encienden solas. Mientras tanto, **generas en 9:16 y sacas los demás formatos con el
reencuadre**, que no depende del modelo.

Dos detalles:

- **4:5 es de imagen y carrusel.** Ningún modelo de vídeo del catálogo lo genera, así que un proyecto de vídeo no lo
  puede tener como principal; en el montaje sí se exporta en 4:5 con reencuadre.
- Si animas un **fotograma en una proporción que el modelo de vídeo no admite** (por ejemplo un 4:5 con Veo, que
  hace 9:16 y 16:9), no se manda sin más: se te avisa y te pide elegir para el clip uno de los que admite. Escenara
  no recorta el fotograma por su cuenta.

Si por lo que sea el modelo que va a recibir un trabajo **deja de admitir** su proporción entre que lo pides y se
envía (un relevo a otro proveedor, un cambio del catálogo), el trabajo **no se envía con otra**: se cierra diciendo
por qué y **sin cobrarte**. Por la misma razón, las reservas del [mapa de modelos](mapa-de-modelos.md) que no admiten
la proporción elegida no se usan para ese trabajo.

### Cambiar el principal

Se cambia en el paso **«La idea»** del proyecto, con el mismo selector, mientras el plan no esté aprobado y no
haya clips. Después ya no: cambiarlo dejaría escenas
generadas en una proporción y aprobadas para otra. En ese caso añade el formato que quieras como **formato más**
en el montaje: sale del mismo clip y no cuesta nada.

## 2. Un montaje, varios formatos

En **Proyecto › Montaje**, el panel **«Formatos y encuadre»** tiene:

- **Los formatos de este proyecto.** El principal va marcado y no se quita; los demás se añaden o se quitan con un
  clic. Se guarda al momento y no toca lo que tengas sin guardar en la línea de tiempo.
- **Una pestaña por formato** con cada fragmento dibujado en el marco de ese formato, con sus **zonas seguras**.

### El encuadre de cada escena

Cuando un clip vertical se lleva a un formato más ancho, algo se queda fuera. Tú decides qué:

- **Arrastra el vídeo** dentro del marco para elegir qué parte se queda, o usa las **flechas del teclado** con el
  marco seleccionado;
- o usa los atajos: **Centrado**, **Izquierda**, **Derecha**, **Arriba**, **Abajo** o **Entero, con bandas** (el clip
  cabe entero y el resto se rellena de negro).

Lo que ves es lo que sale: la previsualización y el render usan la misma cuenta. Si el recorte **deja fuera más de la
mitad del plano** —un vertical llevado a 16:9 conserva un tercio— se avisa en la escena y en el panel de
exportación. Puedes exportar igual: es un aviso para que lo mires, no un freno.

Sin tocar nada, cada formato usa su encuadre **automático**: el vertical, el de siempre (entero, que para un clip
vertical es idéntico); los demás, recorte centrado. El encuadre **se guarda con el montaje** («Guardar el montaje»)
porque cambia lo que sale en el MP4.

### Zonas seguras de cada formato

Los subtítulos quemados y la etiqueta de contenido sintético se colocan **dentro de la zona segura de cada
formato**, fuera de lo que tapa la interfaz de la plataforma:

| Formato | Franja de arriba | Franja de abajo |
|---|---|---|
| Reels · TikTok · Stories (9:16) | 12 % | 22 % |
| Instagram feed y carrusel (4:5) | 6 % | 12 % |
| Cuadrado (1:1) | 6 % | 12 % |
| YouTube · horizontal (16:9) | 8 % | 14 % |

Son aproximaciones documentadas, no una garantía: cada aplicación cambia su interfaz cuando quiere.

### Exportar en cada formato

En **«Exportar el vídeo»** eliges **el formato de este MP4** y pulsas **«Montar y exportar el MP4 en…»**. Cada
formato es **su propia exportación**, con su progreso y su descarga. Pedir dos veces el mismo formato de la misma
versión te devuelve la que ya hay; pedir otro formato monta otro fichero. Todo sin créditos: solo ocupa la cuota de
tu biblioteca.

## 3. Proyectos largos

Un proyecto puede tener como mucho **30 escenas** y un montaje de **5 minutos** (300 s). Quien administra puede
**bajar** esos máximos en Admin › Ajustes › Montaje, exportación y tamaño de los proyectos, nunca subirlos por encima
de lo que admite esta versión.

Pasarse **se rechaza diciendo por qué**:

- al añadir una escena de más: «Este proyecto ya tiene 30 escenas y el máximo de esta instalación son 30»;
- al guardar o exportar un montaje largo: «El montaje dura 312 s y el máximo de esta instalación son 300 s».

Las escenas que ya tuviera un proyecto no se borran si el máximo baja: simplemente no se pueden añadir más.

Producir 30 escenas no cambia ninguna regla de gasto: la producción por lotes respeta el **tope de escenas a la
vez**, el **presupuesto autorizado** del proyecto y la confirmación de coste de siempre, y cada escena enseña su
progreso real ([Producir tu proyecto](producir-tu-proyecto.md)).

## 4. Las versiones de cada escena

Cada vez que generas otro clip de una escena, el anterior **no se borra**. En la tarjeta de la escena, en
producción, **«Versiones del clip»** las enseña todas, de la más reciente a la más antigua, con su miniatura, el
modelo, lo que costó (el que informó el proveedor o, si no lo informó, la estimación, y se dice), el tamaño y la
fecha.

- **«Usar esta»** cambia el clip que entra en el montaje. **No cuesta nada y no borra ninguna**: puedes volver a la de
  antes cuando quieras.
- El montaje **estrena versión**: una exportación de antes queda como «de una versión anterior», para que no
  publiques la que no toca.
- La **revisión de continuidad** de la escena deja de valer, igual que al regenerar: lo revisado ya no es el clip
  que hay. Vuelve a comprobarla.
- Si la escena tiene **un clip generándose**, espera a que termine: al acabar pasaría a ser el de la escena y taparía
  el que eliges.
- Si el recorte que tenías en el montaje es más largo que la versión que eliges, el montaje te lo dirá al guardar o
  exportar («acaba en el segundo 8 y el clip dura 6»). Ajusta la manecilla de salida.

Las escenas de **podcast** eligen sus dos clips juntos al producirlas: no tienen biblioteca de versiones.

## 5. Cuota y coste

| Qué | ¿Cuesta créditos? | ¿Ocupa cuota? |
|---|---|---|
| Elegir para qué es la pieza | No | No |
| Añadir o quitar un formato del montaje | No | No |
| Ajustar el encuadre de una escena | No | No |
| Exportar en un formato | No | Sí, el MP4 |
| Usar otra versión de una escena | No | No (ya estaba guardada) |
| Generar otro clip de una escena | **Sí**, con confirmación | Sí, el clip nuevo |

Cuando tu biblioteca pasa del **80 %** de la cuota, la biblioteca de versiones lo avisa y te dice **cuánto ocupan
las versiones que no usas** de ese proyecto. Si necesitas sitio, envíalas a la papelera desde tu
**Biblioteca** y vacía la papelera: si la cuota se llena, el clip de la siguiente generación no se
podrá guardar aunque el proveedor lo haya hecho.

## Lo que esta versión no hace

- **Reencuadre inteligente** que siga al sujeto: el encuadre es por escena, fijo durante todo el fragmento.
- Proyectos de **más de 5 minutos**, transiciones o efectos.
- Declarar a mano en el catálogo las proporciones de un modelo: se amplían cuando se comprueban generando.

## Ver también

- [Montar y exportar tu vídeo](montaje-y-exportacion.md) — la línea de tiempo, la mezcla y la etiqueta.
- [Producir tu proyecto](producir-tu-proyecto.md) — cómo se generan los clips y qué cuesta cada uno.
- [Presets y plantillas](presets-y-plantillas.md) — la botonera de «Crear», con la familia Formato.
