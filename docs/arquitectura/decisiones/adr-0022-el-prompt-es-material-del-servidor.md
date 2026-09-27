# ADR-0022 · El prompt compuesto es material del servidor y del panel de administración, no del navegador

- **Estado:** propuesto (decisión **firme** del propietario del 2026-09-27; el ADR queda propuesto hasta que se revise el texto)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.17.0

## Contexto

Hasta la 0.16.0, Escenara le enseñaba al usuario el prompt final y le dejaba editarlo. Había una buena razón:
quien paga tiene derecho a saber qué se envía. Y tres consecuencias que no se habían medido:

- **el prompt viajaba entero al navegador**, y con él sus piezas: el texto de la plantilla y el fragmento en
  inglés de cada preset. Eso es el trabajo de composición de la instalación, lo que distingue un resultado bueno
  de uno mediocre, y se regalaba en cada carga de «Crear»;
- **el texto editado a mano era una entrada más** que había que limpiar, validar y explicar. Funcionaba (la
  limpieza anti-inyección está probada), pero cada camino de entrada que se abre hay que sostenerlo para siempre;
- lo que el usuario veía **no era lo que iba a entender**: un prompt en inglés lleno de vocabulario de encuadre no
  le dice a la mayoría de la gente nada más que «esto es complicado».

Y en la 0.17.0 aparece un cuarto motivo, este de producto: el propietario quiere poder ofrecer el prompt como
parte de un plan de pago más adelante. Una vez que ha salido hacia el navegador, ya no se puede volver a guardar.

## Opciones

1. **Seguir mostrándolo y dejándolo editar.** Supone que el valor está en la transparencia total. Falla en lo que
   acaba de decidirse como producto: regala algo que se quiere poder ofrecer aparte, y lo regala a todo el mundo.
2. **Ocultarlo y no enviarlo, con el admin como única excepción.** Supone que al usuario le basta con ver **lo que
   ha elegido** y **lo que va a costar**. Falla si alguien necesita el prompt para explicar un resultado raro: de
   ahí la excepción del panel, que es donde se atiende un problema de verdad.
3. **Ocultarlo por defecto y dejar un ajuste por usuario.** Es la 2 más un interruptor. No falla en nada, pero un
   ajuste que nadie usa todavía es código sin probar: se deja el interruptor **apagado y a nivel de instalación**,
   que es lo que hace falta para los planes de pago, y no uno por cuenta.

## Decisión

Se elige la **opción 2**, con el interruptor de la 3 apagado y a nivel de instalación. Reglas:

- **El prompt compuesto no sale hacia el navegador de un usuario normal.** Ni en una API, ni en un payload RSC, ni
  en una vista. Se quitan las cuatro pantallas que lo mostraban: «Ver el contexto aplicado» (0.15.0), «Lo que se
  le enviará al modelo» y «Editar el texto final» (0.16.0) y «Prompts de esta escena» (0.17.0).
- **Tampoco sus piezas.** El fragmento en inglés de cada preset y el texto de la plantilla dejan de viajar
  (`PresetVisible`, `PlantillaVisible`). Lo que el navegador recibe es lo que necesita para pintar la botonera:
  nombre, descripción y lo que el preset **exige del modelo** (proporción y duración), que es lo que permite
  deshabilitarlo con su motivo escrito.
- **Lo que el usuario sí ve es lo que ha elegido y lo que cuesta**: los botones que ha pulsado, su descripción, de
  qué versión de la ficha sale el contexto, **qué fotos** se enviarán y la estimación con su fecha. Todo eso es
  suyo o es una consecuencia de lo que ha decidido.
- **Lo que escribió la persona sigue siendo suyo**: el historial muestra su descripción (`TrabajoVista.escena`),
  no el prompt. Y su copia de un preset se sigue pudiendo renombrar y redescribir; el fragmento en inglés se
  hereda del original y se edita en Admin › Presets.
- **La comprobación del navegador deja de componer.** «Qué falta por elegir» se calcula con una función pura sobre
  las variables declaradas (`faltanPorElegir`), sin renderizar ninguna plantilla. Sigue siendo la misma regla que
  el servidor aplica al componer, así que la botonera no ofrece nada que luego se rechace.
- **Quien administra sí lo ve**, en `/admin/trabajos`, junto al trabajo. Sin eso, un rechazo del proveedor o un
  resultado raro no se podrían explicar nunca, y esa pantalla existe justo para eso.
- **Queda un ajuste, apagado**: «Mostrar el prompt a los usuarios» (`mostrarPromptAlUsuario`). Encendido, el prompt
  vuelve a llegar en `TrabajoVista.prompt`. Es el gancho para los planes de pago, no una opción que haya que tocar
  hoy.
- **El prompt sigue guardándose entero en el trabajo** (`generation_jobs.prompt`), como desde la 0.10.0: es lo que
  hace auditable el gasto y lo que permite explicar qué se envió. Cambia quién lo lee, no que se guarde.

## Consecuencias

- Se gana que el trabajo de composición de la instalación deje de ser público, y la posibilidad de ofrecerlo como
  parte de un plan sin tener que retirar nada.
- Se gana una superficie de entrada menos: sin «editar el texto final» no hay un texto libre más que limpiar,
  validar y explicar en cada versión.
- Se pierde transparencia para el usuario avanzado, que era una ventaja real. Se compensa con lo que sí se le
  muestra —lo elegido, las fotos, la versión de la ficha y el coste— y se puede recuperar encendiendo el ajuste.
- Se pierde la previsualización exacta en vivo. A cambio, el navegador ya no necesita recibir las piezas del
  prompt, que era la única razón por la que las tenía.
- **Habrá que revisar** esta decisión cuando existan los planes de pago: ahí el interruptor tendrá que pasar de
  ser de la instalación a ser por cuenta, y eso es otra decisión.

## Ampliación del 2026-09-27 (decisiones provisionales del propietario)

Tres decisiones que llegaron con la segunda revisión. Van aquí porque las tres tratan del dinero y de los datos que
salen de Escenara, que es lo que este ADR gobierna en la práctica.

### El presupuesto autorizado de un proyecto es un tope que se aplica **al gastar**

No solo una condición para aprobar el plan. `exigirTopeDelProyecto` se comprueba **antes de reservar** en los dos
caminos que pueden gastar en nombre de un proyecto: producir una escena (`crearFotograma` / `crearAnimacion` con
`escenaId`) y llamar al asistente. Lo que se compara es *lo que el proyecto lleva comprometido* —consumos y
reservas vivas de los trabajos de sus escenas **más** las llamadas de su asistente— frente a
`projects.authorized_credits`. `0` significa «sin tope propio»: manda el presupuesto del usuario y el tope por
trabajo de la instalación.

Por qué: entre aprobar y producir puede pasar cualquier cosa (más escenas, otro precio, varias llamadas al
asistente). Sin esta puerta, el techo que alguien autorizó no sería un techo, sería un comentario.

### El coste de la traducción entra en lo que el usuario confirma

`total confirmado = generación + traducción`. Lo calcula la **misma función** en el navegador y en el servidor
(`creditosAConfirmar`), así que la cifra del botón es la que se compara al confirmar. Y esa suma es la que se mide
contra el **tope por trabajo** de la instalación (`exigirTopePorTrabajo`) y contra el umbral de aviso: las dos
llamadas son el mismo envío para quien las paga.

Sigue siendo un **máximo**: un texto ya traducido no se vuelve a pagar. Pero lo que se confirma no puede depender
de si hay caché, porque entonces la cifra cambiaría entre la pantalla y el botón.

### Las traducciones de la ficha de un personaje se borran con el personaje

`translation_cache` guarda a qué personaje pertenece el texto traducido (`character_id`), y el borrado del
personaje las borra en su misma transacción, junto con su consentimiento y sus derivados. La ficha describe a una
persona: su traducción es material suyo y no puede sobrevivir a la revocación de su consentimiento (ADR-0017).

Y se dice donde tiene que decirse: **el formulario de consentimiento** enuncia que al generar con ese personaje se
envían a KIE sus fotos **y el texto de su ficha**, y que si la instalación traduce los prompts, ese texto pasa
además por su modelo de texto. `docs/legal/cumplimiento-y-privacidad.md` lo recoge como tratamiento, con lo que
queda pendiente para la política de privacidad (nombrar a KIE como encargado también para texto y fijar el plazo de
conservación de las traducciones).
