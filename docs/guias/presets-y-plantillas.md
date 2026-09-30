# Presets y plantillas: crear con botones

Desde la 0.16.0, «Crear» ya no es un campo de texto en blanco. Eliges con **botones** de qué va el vídeo, cómo se ve y qué hace el personaje, y ves el coste y lo que falta antes de gastar un solo crédito. El texto que se compone para el modelo no se enseña a los usuarios (ver más abajo).

## Los botones

Cada botón es un **preset**. Las familias de origen son seis:

| Familia | Qué decide | Ejemplos sembrados |
|---|---|---|
| **Especialidad** | De qué va el vídeo | Moda, fitness, gastronomía, viajes, belleza, mascotas |
| **Formato** | La proporción de la imagen | Reel 9:16, story 9:16, cuadrado 1:1, horizontal 16:9 |
| **Look** | Luz, color y acabado | Natural, editorial, nocturno neón, luz dorada, estudio |
| **Vestuario** | Qué lleva puesto en esta escena | De calle, deportivo, elegante, de casa |
| **Duración** | Cuántos segundos dura el clip | 4, 6 u 8 segundos |
| **Acción** | Qué hace delante de la cámara | Saluda, camina, enseña algo, se ríe, da una vuelta |

Casi todas son de **una sola opción**: pulsar otra sustituye la anterior, y pulsar la misma la quita. **Acción** admite varias a la vez.

Desde la 0.25.0 hay más familias, las de la dirección del clip: plano, ángulo, óptica, luz, localización, cámara, micro-acción, registro estético y anclajes, y después las de producto, ángulo del anuncio y estilo animado. Esas se eligen en el panel de dirección (mira [Dirigir tu clip](dirigir-tu-clip.md)) y no se repiten más abajo, así que qué botones de la tabla ves exactamente en «Crear» depende de lo que ya elijas en ese panel.

El vestuario que elijas aquí **manda sobre el vestuario habitual** de la ficha del personaje: la ficha dice lo que suele llevar, y la escena dice lo que lleva hoy.

## Lo que no se puede generar sale deshabilitado

Un botón con el icono de prohibido y un motivo escrito debajo es una opción que **el modelo que has elegido no admite**. No es un capricho de la interfaz: viene del catálogo de modelos de esta instalación, donde está apuntado lo que cada modelo acepta de verdad.

Hoy, por ejemplo:

- todos los modelos de imagen del catálogo admiten **solo 9:16**, así que los formatos cuadrado y horizontal salen deshabilitados con «Nano Banana 2 Lite solo admite 9:16». Están ahí porque el catálogo es editable y el día que se añada un modelo con 1:1 dejarán de estarlo;
- el **clip** no elige formato: lo hereda de la imagen que anima;
- la **duración** solo ofrece la que se le envía de verdad al proveedor, que es la que tiene el precio medido: el proveedor cobra **por unidad** («vídeo de 4 s»), así que ofrecer 8 s con el precio de 4 s sería mentirte en la estimación. Las de 6 y 8 segundos están sembradas y lo explican en su descripción; para usarlas hay que registrar su precio en Admin › Modelos primero.

Cambiar de modelo vuelve a calcular todo esto. Nunca se te ofrece un formato que no se pueda generar.

## Lo que has elegido

Debajo de los botones hay una **zona de claridad** con lo que has elegido: la especialidad, el formato, el look y
lo demás, con su nombre en español.

Con eso y tu descripción, **el servidor compone** el texto que se le envía al modelo. Va **en inglés**, porque los
modelos responden claramente mejor así. **Ese texto no se muestra y no se puede editar** (desde la 0.17.0): es
material de Escenara y del panel de administración. Quien administra puede enseñarlo a los usuarios con el
ajuste **«Mostrar el prompt a los usuarios»**, en Admin › Ajustes › Asistente de guion y proyectos; de fábrica
está apagado. Tú decides el qué —lo que eliges y lo que escribes— y el cómo
se escribe lo pone la plantilla de la instalación.

Si tu instalación tiene la traducción encendida, lo que escribas en español se traduce al inglés antes de
componer, y eso cuesta unos créditos que verás en el coste estimado. Lo que **dice** el personaje no se traduce.

Si falta algo obligatorio, la zona de claridad lo dice («Falta elegir: Especialidad»), el motivo aparece también
en la lista de lo que impide generar y el botón no se activa.

Y si quien administra cambia la plantilla entre que la miras y pulsas el botón, el envío se rechaza con «La
plantilla ha cambiado desde que viste el coste: revisa el coste otra vez y confirma» **antes de gastar nada**. Si lo que pasó fue un fallo
de red y vuelves a pulsar, se te devuelve el trabajo que ya se encargó: no se paga dos veces.

## Duplicar un preset para hacerlo tuyo

Debajo de cada botón de la instalación hay **«Duplicar para editarlo»**. La copia es **tuya**: aparece marcada como «Tuyo», nadie más la ve y puedes cambiarle el **nombre** y la **descripción** sin tocar la de la instalación. El fragmento en inglés que entra en el prompt se hereda del original y se edita en Admin › Presets: desde la 0.17.0 no sale hacia el navegador.

Compartir presets y plantillas entre cuentas llega en una versión posterior.

## Si administras esta instalación

- **Admin › Presets**: alta, edición, orden y activado de los presets de la instalación. El orden se cambia **arrastrando** cada preset por su asa dentro de su categoría (o con el teclado: Espacio para cogerlo, flechas para moverlo, Espacio para soltarlo y Escape para dejarlo como estaba). Al soltar se guarda el orden de la categoría entera, sin empates. **Subir** y **Bajar** siguen ahí y intercambian el preset con su vecino. Un preset nuevo va al final de su categoría; el formulario ya no tiene un campo «Orden». La **descripción** va en español (es lo que se lee en el botón) y el **texto del prompt** en inglés (es lo que entra en el prompt). Un preset desactivado no se puede elegir ni enviar.
  - En un preset de **formato**, la proporción va en su campo propio, **no dentro del texto del prompt**: es una restricción que se comprueba contra el modelo. El texto describe el encuadre en palabras («vertical full-bleed framing»), porque las medidas escritas («9:16», «1080p») se limpian del prompt por seguridad.
  - Para añadir presets a la **semilla** de una instalación nueva, la fuente es `apps/web/src/server/prompts/presets.json`: se añade una entrada con una clave nueva y se vuelve a migrar. La semilla **no pisa** lo que hayas cambiado desde el panel.
- **Admin › Plantillas**: el texto con las variables `{{así}}`, sus variables declaradas y sus restricciones por modelo, con **previsualización** y **historial de versiones**. Se agrupan por capacidad y se ordenan **arrastrando** por el asa dentro de cada una, igual que los presets (con teclado: Espacio para cogerla, flechas para moverla y Espacio para soltarla); una plantilla nueva va al final de su capacidad.
  - Cambiar el texto, las variables o las restricciones **crea una versión nueva** y exige un motivo. Cambiar el nombre, la descripción, el orden o el estado no crea versión.
  - **Editar una plantilla no cambia lo que ya se generó**: cada trabajo guarda la versión que usó y su prompt final.

## Lo que no cambia

Nada de lo que ya protegía tu dinero y la privacidad de las personas:

- **nada se envía sin que confirmes el coste** que se te ha mostrado, y la misma confirmación no se cobra dos veces (la plantilla, su versión, los presets y el texto editado entran en esa confirmación);
- **la previsualización es solo lectura**: no encola nada, no reserva presupuesto y no habla con ningún proveedor;
- **las puertas del consentimiento siguen donde estaban**: sin consentimiento vigente, sin fotos suficientes y sin la revisión de las referencias no sale nada.
