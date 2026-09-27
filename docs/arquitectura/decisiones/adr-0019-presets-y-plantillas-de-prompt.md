# ADR-0019 · Presets y plantillas de prompt: prompts en inglés, compuestos en el servidor y con versión citada

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.16.0

## Contexto

Hasta la 0.15.0, «Crear» tenía **un campo de texto libre**. Funciona para quien sabe escribir prompts y no funciona para nadie más: el resultado depende de acertar con palabras que nadie explica, y dos personas que quieren lo mismo escriben cosas distintas. El PRD (RF04) pide botones: especialidad, formato, estilo, vestuario, duración y acción.

Eso abre tres decisiones de arquitectura que no se pueden dejar implícitas:

- **en qué idioma van los prompts.** Los modelos de imagen y vídeo responden mejor en inglés, y la interfaz está en español. Si el texto se escribe en español, se pierde calidad; si se muestra en inglés, la mitad de los usuarios no entiende lo que va a enviar;
- **quién compone el texto final.** La 0.15.0 fijó (ADR-0018) que el prompt lo compone **el servidor** a partir de una versión inmutable de la ficha del personaje, porque el navegador no es de fiar y porque un prompt hay que poder auditarlo. Una plantilla con variables es exactamente el mismo problema, con más huecos;
- **qué pasa cuando la plantilla cambia.** Si quien administra edita una plantilla, los trabajos de la semana pasada dejarían de poder explicarse.

Y una restricción que viene del catálogo de modelos (ADR-0015 y 0.11.0): **un formato que el modelo no admite no se puede generar**. Hoy todos los modelos de imagen del catálogo declaran `proporciones: ["9:16"]`, y dos de los de vídeo declaran la lista vacía, que significa «no acepta el parámetro: toma la proporción de la imagen». El selector de formato por plataforma y el 4:5 son de la 0.26.0.

## Opciones

1. **Plantillas en español, con el prompt tal cual.** Supone que el modelo entiende el español igual de bien. Falla en la calidad del resultado, que es justo lo que se está intentando mejorar, y no se nota hasta después de pagar.
2. **Plantillas en inglés compuestas en el navegador.** Supone que el cliente es de fiar. Falla en el primer sitio que importa, el mismo de ADR-0018: quien controla el navegador controla entonces el prompt completo, y el servidor no puede reconstruir qué se envió.
3. **Plantillas en inglés compuestas en el servidor a partir de identificadores, con la descripción en español y el texto final visible y editable.** Supone que hay que enviar al navegador los fragmentos de cada preset para poder previsualizar sin una petición por clic. Falla si esos fragmentos fueran secretos; no lo son (son el catálogo de la instalación, y el usuario ve y puede editar el texto final de todas formas).

## Decisión

Se elige la **opción 3**, con estas reglas:

- **El prompt lo compone el servidor**, siempre, a partir de: el identificador de la plantilla, el de su versión, los identificadores de los presets elegidos y el texto que escribe la persona. El navegador **no manda el texto compuesto**; lo que manda, cuando el usuario lo edita a mano, es un texto final que pasa por la **misma limpieza anti-inyección** que la ficha (`limpiarTextoDePrompt`) y queda marcado en el trabajo como `prompt_edited`.
- **La previsualización usa la misma función pura** que el servidor (`lib/plantillas-prompt.ts`), igual que la limpieza de la ficha en 0.15.0. Lo que se ve es lo que se enviará, y no porque se le crea al navegador, sino porque las dos partes calculan lo mismo. Sin una petición por cada clic, y ninguna ruta de lectura mueve dinero.
- **Solo se sustituyen las variables declaradas.** Un `{{otra_cosa}}` no declarado se borra; un valor **no puede introducir más variables**, porque lo sustituido no se vuelve a recorrer; y una variable obligatoria sin valor **impide continuar** y dice cuál falta.
- **Cuatro tipos de variable, y ninguno es texto libre del navegador salvo uno.** `enumerado` toma su valor del fragmento que guardó quien administra en un preset de una categoría; `numero` toma un número declarado por un preset (los segundos del clip); `personaje` solo puede valer **una de dos cadenas fijas** («the same person…» / «the same animal…»), así que el nombre de la persona nunca sale hacia el proveedor; `texto` es la escena que escribe el usuario, y pasa por la limpieza.
- **Los prompts van en inglés y la interfaz en español.** Cada preset tiene su `descripcion` en español (es lo que se lee en el botón) y su `valores.prompt` en inglés (es lo que entra en el prompt). El texto final se muestra tal cual en una zona de claridad y se puede **editar**.
- **La proporción y la duración no viajan dentro del prompt: viajan como restricción comprobable.** Un preset de formato declara `valores.proporcion` y uno de duración, `valores.segundos`, y se validan contra `ParametrosModelo` del catálogo **antes de encolar**. Esto es doblemente necesario: la limpieza anti-inyección se lleva por delante cualquier medida de salida escrita en texto («9:16», «1080p»), venga del usuario **o del propio preset**, así que el texto describe el encuadre en palabras («vertical full-bleed framing») y la proporción real la decide el catálogo.
- **Nada se ofrece si no se puede generar.** Un preset que el modelo elegido no admite sale **deshabilitado con el motivo escrito** en la botonera, y si aun así llega al servidor se rechaza con **409** antes de reservar presupuesto o tocar al proveedor. La comprobación es **la misma función** en los dos sitios.
- **La duración tiene que ser la que se le envía de verdad al proveedor**, que es la primera que declara el modelo, porque el precio registrado es por esa unidad («vídeo de 4 s»). Ofrecer 8 s con el precio de 4 s sería mentir en la estimación. Registrar el precio de otra duración es un cambio de Admin › Modelos, no de esta capa.
- **Las plantillas se versionan** (`prompt_template_versions`): instantánea del texto, de las variables y de las restricciones, con su motivo y su autor. Editar el texto, las variables o las restricciones **crea versión**; cambiar el nombre, la descripción, el orden o el estado **no**, porque no cambian nada de lo que se le envía al proveedor.
- **Cada trabajo cita su plantilla y su versión** (`generation_jobs.prompt_template_id` y `prompt_template_version_id`) y guarda el prompt **ya compuesto**. Editar la plantilla **no cambia lo ya generado**. Es la misma regla que ADR-0018 para la ficha, por el mismo motivo.
- **Todas las variables de tipo `texto` reciben la escena**, no solo la que se llame `escena` (decisión del propietario, 2026-09-27). En «Crear» hay un solo campo de descripción; una plantilla que llame a su variable `lo_que_se_ve` tiene que funcionar igual. Lo reparte la **misma función** (`textosDeEscena`) en el servidor y en la previsualización, porque si solo lo hiciera uno de los dos, la previsualización diría una cosa y se enviaría otra.
- **La plantilla tiene que declarar la capacidad del tipo de trabajo** (`CAPACIDAD_DE_TIPO`): la del fotograma habla de encuadre y la del clip, de duración y movimiento. Cruzarlas compondría un prompt que no describe lo que se va a generar, y se pagaría igual. Se rechaza con 409 y el motivo escrito.
- **La confirmación cita la versión de la plantilla y esa versión tiene que ser la vigente.** Si quien administra la editó entre la pantalla y el botón, se responde **409** («La plantilla ha cambiado: revisa el texto y confirma otra vez») antes de reservar presupuesto o tocar al proveedor, exactamente como con la versión de la ficha en ADR-0018: la firma de idempotencia evita cobrar dos veces lo mismo, no evita gastar en un texto que el usuario no ha revisado. El **reintento con la misma clave sigue devolviendo el trabajo que ya existe**, porque el corte por clave va **antes** de componer.
- **La versión, los presets elegidos y el texto editado entran en la firma de idempotencia**: si cambia cualquiera de los tres, la clave se renueva y no se reutiliza la confirmación de otra cosa.
- **Dos dueños y nada más.** `owner_id` nulo = de la instalación, que edita quien administra; con dueño = copia de un usuario, que solo ve y edita él. Cada usuario **duplica** un preset para hacerlo suyo. Compartir plantillas entre cuentas es de 0.28.0.

## Consecuencias

Se gana: un «Crear» que se usa con botones, prompts en inglés sin que el usuario tenga que escribirlos, un prompt auditable (plantilla, versión, presets y texto final guardados) y una puerta menos por la que colar instrucciones, porque los huecos de la plantilla los rellena el servidor con valores de un catálogo cerrado.

Se pierde: los fragmentos en inglés de cada preset viajan al navegador para poder previsualizar sin peticiones; el catálogo de la instalación deja de ser opaco (no lo era: el usuario ve y edita el texto final). Y un formato del catálogo puede estar sembrado pero no ser usable con ningún modelo actual: se ve deshabilitado con su motivo en lugar de desaparecer, porque el catálogo de modelos es editable y el día que entre un modelo con 1:1 ya está.

Lo que se descartó de la primera versión: dejar que la confirmación usara **una versión antigua** de la plantilla «porque es la que el usuario vio». Suena razonable y es peor: un texto de plantilla que quien administra ha retirado podría seguir saliendo hacia el proveedor indefinidamente, y el usuario no se enteraría de que lo que revisó ya no es lo que la instalación ofrece. Se cambió por el 409, que es lo mismo que hace la ficha.

Habrá que revisar: cuando llegue el selector de formato por plataforma (0.26.0), la proporción dejará de ser solo una restricción del preset y pasará a ser también un parámetro que se le envía al proveedor; y cuando lleguen las plantillas compartibles (0.28.0), habrá que decidir qué significa `owner_id` en una plantilla que circula entre cuentas.
