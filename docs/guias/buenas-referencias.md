# Buenas referencias: la captura guiada

**Versión:** 0.19.4 · **Para:** quien usa Escenara

Las fotos de referencia son lo único que sostiene el parecido de un personaje entre fotogramas. Una foto
movida, oscura o diminuta no ayuda: el modelo se inventa lo que no ve. Desde la 0.14.0, Escenara te dice
**qué vista falta**, te guía al hacerla y **rechaza** lo que no va a servir, siempre diciendo por qué y qué
hacer para arreglarlo.

Lo que se mide, se mide **en tu equipo y en tu instalación**: no se manda ninguna foto a ningún sitio para
analizarla y no se gasta ni un crédito. De cada foto se guardan cuatro números (tamaño, enfoque, luz y, si tu
navegador sabe, cuánto ocupa la cara) y una huella con la que se detectan las repetidas.

## Las vistas que hace falta cubrir

En la ficha del personaje, el panel **«Vistas del personaje»** enseña una tarjeta por vista, con la silueta de
lo que hay que encuadrar:

| Personas | Animales |
|---|---|
| De frente | De frente |
| Perfil izquierdo | De perfil |
| Perfil derecho | Cuerpo completo |
| Tres cuartos | |
| Cuerpo completo | |

La cobertura es una **guía**, no un candado: lo que decide si el personaje puede generar sigue siendo el
mínimo de fotos de **Admin › Ajustes › Personajes** (3 por defecto). Una foto sin vista asignada cuenta para
ese mínimo, pero no cubre ninguna vista.

## Decir qué vista es una foto que ya tienes

Las fotos que subes desde tu biblioteca entran **sin vista**: Escenara no adivina si una foto es de frente o de
perfil, porque fingirlo sería inventarse un dato. Así que si ya habías subido tus fotos, la cobertura te dirá que
faltan vistas aunque las tengas.

Se arregla en **«Fotos de referencia»**: cada foto lleva el selector **«Qué vista es»** con las vistas de su tipo
de personaje y **«Sin clasificar»**. Eliges la vista y la cobertura se actualiza al momento.

- cuando falta una vista y tienes fotos sin clasificar, el panel de cobertura te lo dice antes de proponerte
  hacer otra foto o generar una de pago, y te lleva ahí con **«Clasificar mis fotos»**;
- puedes **cambiarla** cuantas veces quieras, o volver a **«Sin clasificar»**;
- cambiar la vista **crea una versión** del personaje, igual que añadir, quitar o reordenar fotos: las fotos que
  se envían al modelo se eligen por cobertura, así que decir que una foto es de perfil cambia lo que se envía.
  Volver a poner la misma vista no gasta un número de versión;
- una **vista generada** no lleva selector: su vista es la que pidió su trabajo y no se cambia. Si no te sirve,
  quítala.

## Hacer la foto

Pulsa **«Hacer la foto»** en la vista que falte. Se abre el visor con el **marco Enfoque**: las cuatro esquinas
encuadran y la silueta de dentro te dice dónde colocarte. Debajo se lee la indicación («gira la cabeza del todo
a tu izquierda, hasta ver la oreja»).

- **Encender la cámara** pide permiso al navegador. Puedes **cambiar de cámara** (frontal o trasera) las veces
  que quieras; la frontal se muestra en espejo para que puedas colocarte.
- **Subir una foto** hace lo mismo con una foto que ya tengas: la guía y el control de calidad son idénticos.
  Es el camino para quien no quiere dar permiso de cámara, o para un ordenador que no tiene.
- Todo funciona con el teclado: son botones normales, sin gestos.
- Si pediste al sistema que reduzca las animaciones, la silueta no se mueve.

Al disparar, la foto se recorta al encuadre de esa vista y se mide **antes de subirla**. Si no vale, la repites
sin haber ocupado espacio de tu cuota.

## Qué se rechaza y qué hacer

| Aviso | Qué pasa | Qué hacer |
|---|---|---|
| **Foto pequeña** | El lado menor no llega al mínimo (512 px por defecto) **medido con el tamaño con el que se va a guardar** | Usa la foto original en vez de una captura de pantalla, o acércate y repítela |
| **Foto demasiado grande** | Tiene tantos píxeles que analizarla bloquearía el servidor | Redúcela (2000 px de lado sobran) y vuelve a subirla |
| **Foto borrosa** | Se ha movido o no ha enfocado | Sujeta el móvil con las dos manos, espera a que enfoque y repite |
| **Poca luz** | La cara se pierde en la sombra | Ponte de cara a una ventana o enciende una luz |
| **Demasiada luz** | Los rasgos se pierden en el blanco | Apártate del foco o baja la luz |
| **Cara pequeña** | La cara ocupa muy poco del encuadre | Acércate hasta que ocupe buena parte |
| **Duplicada** | Ya tienes esa foto, o una casi idéntica | Haz otra desde otro ángulo |

**«Foto pequeña», «foto demasiado grande» y «duplicada» no se pueden saltar.** Una foto demasiado pequeña no aporta identidad, y una
repetida no aporta nada nuevo. Los demás avisos llevan el botón **«Usarla de todas formas»**: la foto se
guarda, y su tarjeta sigue diciendo **todo** lo que le pasaba, para que sepas por qué el resultado puede salir peor.

Si tu navegador no sabe detectar caras (no todos lo hacen), el visor lo dice: se comprueban tamaño, enfoque y
luz, y lo de la cara queda en tus manos.

Quien administra la instalación puede mover todos estos umbrales en **Admin › Ajustes › Calidad de las fotos de
referencia**.

## Generar una vista que falta

Cuando falta una vista y no puedes hacer la foto, la tarjeta ofrece **«Generarla»**: Escenara le pide al
proveedor una imagen de esa vista a partir de las fotos que ya tienes del personaje.

Antes de gastar nada verás el **coste estimado** y tendrás que confirmar, igual que en «Crear»: es dinero de tu
cuenta en el proveedor. El trabajo va a la cola normal, así que puedes cerrar el navegador y seguirlo en el
historial.

Y lo importante:

- lo que sale **no es una foto**: se guarda marcada como **«vista generada»**, con su distintivo encima de la
  imagen, y nunca se presenta como una foto tuya;
- **no cuenta** para el mínimo de fotos originales del personaje, ni puede ser su portada;
- **no cubre** la vista: la cobertura sigue pidiendo la foto de verdad, porque una foto real guía mejor;
- solo se ofrece para una vista que falta **y que no tenga ya una generada**. Si ya la tienes (con foto o con una vista generada anterior), Escenara se niega a gastar créditos en repetirla;
- si la quitas y la vuelves a añadir desde tu biblioteca, sigue entrando **marcada como generada**: no hay forma de convertirla en una foto tuya.

Para generar hace falta tu clave de KIE en «Tu cuenta». Sin ella, el panel lo dice y no ofrece generar nada;
hacer las fotos, en cambio, funciona igual y no cuesta nada.

Si el personaje no puede generar (falta su consentimiento, está revocado o está en revisión), tampoco puede
generar vistas: es la misma regla, y no hay atajo.

## Y la privacidad

Las fotos de un personaje son datos personales. Solo las ves tú: ni quien administra la instalación puede
mirarlas. Al generar, las referencias sí se suben al almacenamiento temporal del proveedor, donde quedan
accesibles por enlace unas horas; por eso hay que confirmar expresamente que en ellas **no aparece ninguna
otra persona ni ningún menor** antes de cada envío.

Más detalle en [«Crear un personaje»](crear-un-personaje.md) y en
[«Cumplimiento y privacidad»](../legal/cumplimiento-y-privacidad.md).
