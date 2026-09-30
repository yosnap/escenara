# Usar y administrar trends

Un trend es un formato de clip corto. La tarjeta explica en castellano qué se verá, cuánto dura y si permite diálogo. La plantilla que compone el prompt se guarda en el servidor; la pantalla no muestra su texto interno.

> **Antes de empezar: alguien de administración tiene que publicar un trend.** Solo se pueden elegir los trends
> con vigencia **«Vigente»**, y los que están «En revisión» o «Caducada» no salen. Un administrador los publica en
> **Admin › Plantillas**, abriendo una plantilla de tipo «Trend» y poniendo su **Vigencia** en «Vigente». Mientras no
> haya ninguno publicado, el selector de trends de la escena solo dirá **«Todavía no hay trends aprobados por la
> administración»** y no habrá nada que elegir. Las plantillas iniciales se crean en «En revisión», así que en una
> instalación nueva hay que publicar alguna primero.

## Elegir uno

En **Crear**, el trend se elige **en el primer paso, «Elige el formato»**, antes que nada: el trend decide la duración del clip y si se puede hablar a cámara, y el resto de pasos se adapta a esa elección. Ahí está el selector **«Plantilla o trend vigente»** con la plantilla normal y los trends publicados; al elegir un trend ves su vista previa (qué se verá, cuánto dura y si permite diálogo). La duración se fija a la de ese formato y Escenara vuelve a pedir al servidor la estimación del modelo; mientras tanto el paso dice que está pidiendo el coste. Si el modelo del clip no tiene tarifa para esa duración (Veo 3.1 Fast, por ejemplo, solo tiene clips de 4 y 8 s), Escenara cambia **solo** a un modelo compatible, prefiriendo uno que conserve la voz si el que tenías la tenía, respetando los «Modelos permitidos» del trend (que también provocan el cambio si el tuyo no está entre ellos), y te lo dice con un aviso («Hemos cambiado a X porque Y no tiene clips de 6 s»). Si vuelves a «Sin trend», recuperas el modelo que tenías antes del cambio (salvo que hayas elegido otro a mano). Si ningún modelo disponible sirve, el error dice por qué, el trend no se aplica y no se cobra nada. En el selector de modelo del paso del clip, los modelos sin tarifa para la duración del trend siguen en la lista, marcados como no disponibles y con el motivo. **Si no hay ningún trend publicado**, «Crear» se abre directamente en el paso siguiente y el de formato dice por qué no hay trends; si además solo hay una plantilla para el clip, el paso de formato ni siquiera sale en la barra. Los campos que pida el trend se rellenan después: los botones, en el paso **«El clip»**, que ya no repite el selector, y el texto de la escena en «Describe la escena» o, si partes de una imagen tuya (que no tiene ese paso), en el propio paso del clip. El resumen de coste de ese paso muestra créditos, fecha del precio, posibles costes de traducción y el total exacto que hay que confirmar.

En un **proyecto**, abre una escena: debajo de su dirección está la sección **«Trend del clip»** con el selector «Formato vigente» (no aparece si el formato de la escena es cantar). Si no hay trends publicados, solo ofrece «Sin trend». Solo se pueden elegir formatos cuya duración coincide con la del proyecto. El plan vuelve a mostrar y a confirmar el coste antes de producir. Si el formato no permite habla, el guion no entra en el prompt del clip; puedes poner la voz en off más adelante. Si eliges un producto, se pide como parte de la escena y se aplican sus avisos y la comprobación de fidelidad.

Si un trend caduca entre la elección y la confirmación, el servidor bloquea la generación sin reservar créditos. El mensaje señala la copia vigente equivalente cuando existe. Vuelve a elegirla y revisa otra vez el coste. Si el modelo de vídeo no admite la foto del producto como referencia, la pantalla avisa de que la etiqueta puede variar y pide confirmar el aviso antes de animar. El fotograma puede reutilizarse tras un fallo del clip si autorizas el reintento; al cambiar la escena o el modelo, revisa si hace falta un nuevo fotograma.

## Dar de alta y mantener uno

Quien administra abre **Admin › Plantillas**, crea una plantilla de tipo «Trend» y define nombre y descripción en castellano, texto de composición y variables, plataforma de referencia, duración objetivo, si permite habla y motivo de la versión. La referencia informativa del admin debe ser una URL HTTPS sin credenciales. Guarda primero en **revisión** y comprueba la vista del catálogo de componentes. La edición del texto, las variables o el permiso de habla crea otra versión y conserva las anteriores para los trabajos ya hechos.

Qué pide cada campo del diálogo de un trend:

| Campo | ¿Obligatorio? | Para qué sirve |
| --- | --- | --- |
| Vigencia | Sí | «En revisión» (no sale a los usuarios), «Vigente» (sale en Crear y en las escenas) o «Caducada». |
| Plataforma de origen | No | Nota informativa de dónde nació el formato, por ejemplo «TikTok». No se envía al proveedor ni la ven los usuarios. Vacía es válido. |
| Duración objetivo (s) | Sí | Entre 1 y 600. Es la duración que se fija al elegir el trend y la que se compara con la del proyecto. |
| URL de referencia | No | Un ejemplo del formato para quien administra. Solo HTTPS, sin usuario ni contraseña, hasta 500 caracteres. |
| Permitir habla | Sí (apagado por defecto) | Apagado: el guion nunca entra en el prompt del clip y el clip va mudo. Marcado: solo **permite** la voz, no la obliga; el clip habla si además su formato es de habla a cámara, hay guion y el producto no es una acción sin habla. Déjalo apagado en formatos visuales (giro, ASMR, unboxing) y márcalo solo en los pensados para hablar a cámara. Cambiarlo en un trend publicado crea una versión nueva. |
| Nombre y descripción | Sí | La descripción, en castellano, es lo que lee el usuario al elegir el trend. |
| Texto de la plantilla | Sí | El prompt en inglés, con las variables como `{{escena}}`. Entre 10 y 1200 caracteres. |
| Mínimo de fotos de referencia | Un número | Cuántas fotos exige el trend; 0 = ninguna. |
| Modelos permitidos | No | Identificadores separados por comas. Vacío = cualquier modelo de animación. El valor gris que se ve al principio es solo un ejemplo, no un valor guardado. |
| Variables (JSON) | Sí | Al menos una, con nombre, tipo, etiqueta y si es obligatoria. Todas tienen que usarse en el texto y el texto no puede usar ninguna que no declares. |
| Motivo del cambio | Solo si cambias texto, variables o restricciones | Al menos 4 caracteres. Queda en el historial de versiones. |

## Publicar y retirar un trend

Un trend nuevo empieza **«En revisión»**: nadie más que la administración lo ve. Antes de publicarlo, genera con él un clip de prueba de verdad (gasta créditos) y comprueba que el resultado te convence: que respeta la duración, que el producto se ve bien y que no aparece nada que no debería. Cuando estés conforme, abre la plantilla y pon su **Vigencia** en **«Vigente»**: desde ese momento sale en Crear y en las escenas.

Cuando el formato envejezca, usa **«Caducar trend»**. Una plantilla caducada no se edita ni genera: se duplica, se revisa la copia y se publica cuando corresponda. El interruptor de **Admin › Ajustes** oculta todos los trends a la vez sin borrarlos.

Las plantillas iniciales que trae Escenara están todas «En revisión», incluidas las variantes de 5 s: hay que publicarlas tú tras probarlas. Al probar dos de ellas se vio que el unboxing no es una primera persona perfecta y que la rotulación fina de un producto puede variar, así que revisa el resultado antes de publicar.
