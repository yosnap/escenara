# ADR-0021 · El proyecto es la unidad de trabajo, y el plan aprobado es la única puerta a la producción

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.17.0

## Contexto

Hasta la 0.16.0, la unidad de trabajo era **un trabajo**: se elegía una imagen, se describía una escena y se
generaba un fotograma o un clip suelto. Eso funciona para probar y no funciona para hacer un vídeo: un vídeo son
varias escenas en un orden, con un mismo protagonista, un mismo tono y **un coste total** que hay que poder ver
antes de gastarlo.

RF05 pide concepto, guion por escenas y storyboard. RF14 pide presupuesto por proyecto y etapa. Las dos cosas
necesitan una entidad que agrupe, y la pregunta que hay que decidir no es si existe, sino **qué obliga**:

- si el proyecto es opcional, habrá dos mundos que hacen lo mismo de dos formas distintas, y el presupuesto por
  proyecto no significará nada para los trabajos que se queden fuera;
- si el proyecto es obligatorio **para todo**, hay que rehacer «Crear» y su red de tests, que es la que sostiene
  seis versiones de reglas de dinero, consentimiento e idempotencia;
- y hay un dato que ya existe: los trabajos que la gente ya ha hecho. No se pueden quedar huérfanos ni se pueden
  reescribir.

Y una restricción de dinero que viene de ADR-0016: **nada se envía a un proveedor sin una autorización explícita
del usuario sobre una cifra que ha visto**. Un plan de ocho escenas multiplica por ocho la consecuencia de
equivocarse.

## Opciones

1. **Proyecto opcional, escenas sueltas permitidas.** Supone que conviven bien dos modelos mentales. Falla en el
   presupuesto: «presupuesto autorizado del proyecto» no puede significar nada si la mitad del gasto ocurre fuera
   de cualquier proyecto.
2. **Proyecto obligatorio para todo, incluido «Crear».** Supone que merece la pena rehacer el camino rápido.
   Falla en el coste de la obra y en el riesgo: ningún criterio de aceptación de esta fase lo pide, y tocar el
   flujo que reserva presupuesto y encola es exactamente donde no conviene tocar por gusto.
3. **Proyecto obligatorio para el guion y el storyboard; «Crear» sigue siendo el camino rápido, y los trabajos
   históricos se agrupan al migrar.** Supone que se acepta una asimetría temporal y visible. Falla si la
   asimetría se vuelve permanente y nadie la documenta.

## Decisión

Se elige la **opción 3**, dejándola escrita para que no se vuelva permanente por olvido. Reglas:

- **Una escena pertenece siempre a un proyecto** (`scenes.project_id`, sin nulos). Un trabajo de generación que
  sale de una escena lleva su `scene_id`.
- **«Crear» no cambia.** Sus trabajos nacen con `scene_id` nulo y siguen funcionando exactamente como en la
  0.16.x. Si el propietario quiere que también exija proyecto, es una decisión suya y una versión aparte.
- **Los trabajos anteriores se agrupan al migrar** en un proyecto «Sin título» por usuario, con una escena por
  trabajo en orden de creación y el prompt que se envió de verdad conservado tal cual. Ningún trabajo histórico
  queda fuera de un proyecto y ninguno se recalcula.
- **El presupuesto se autoriza por proyecto** (`projects.authorized_credits`) y **se fija al aprobar el plan**. Un
  plan cuyo total estimado se pasa de ahí no se puede aprobar sin subirlo; un plan sin presupuesto fijado tampoco.
  Es un segundo techo, no un sustituto: el presupuesto por usuario y el tope por trabajo de la instalación
  (ADR-0016) siguen aplicándose igual.
- **La estimación es por escena y se suma por proyecto**, siempre con la palabra «estimación» y **la fecha del
  precio** con el que se calculó, y con un **margen prudente configurable** para los modelos que no están
  `validado`, es decir, los que no tienen coste medido y revisado. El margen se dice; no se esconde dentro de la
  cifra.
- **Aprobar congela lo que se iba a generar**: modelo, sello del precio, versión de la ficha del personaje y
  versión de la plantilla, en la propia fila de la escena. Sin guardarlo no se podría comprobar que una
  aprobación sigue valiendo; solo prometerlo.
- **Cualquier edición de la escena invalida su aprobación**, la devuelve a borrador y **escribe el motivo** en
  lenguaje llano. Reordenar o borrar escenas **no** invalida a las demás: no cambia lo que costarían. Cuando una
  escena deja de estar aprobada, el proyecto deja de estar `planificado`: el plan que se autorizó ya no es el que
  hay.
- **`exigirEscenaAprobada` es la única puerta a la producción.** Cualquier camino que encole una generación a
  partir de una escena pasa por ella, y comprueba tres cosas: que el plan del proyecto está aprobado, que la
  aprobación de esa escena sigue en pie y que **el sello del precio congelado sigue siendo el vigente**. Se
  comprueba **antes** de reservar presupuesto y antes de tocar al proveedor.
- **Un proyecto es privado de su dueño, sin excepción para quien administra.** Un proyecto, una escena o una
  afirmación de otra persona responden 404, y el cruce con el dueño va **en la misma consulta** que trae la fila.
  Un guion es trabajo de alguien y `/admin` no tiene ninguna pantalla que lo necesite; si algún día la tuviera,
  sería otra decisión y con su motivo.

## Consecuencias

- Se gana una cifra que se puede autorizar de una vez: el coste del vídeo entero, desglosado por escena, antes de
  gastar un crédito.
- Se gana que «aprobar» sea un hecho comprobable y no una promesa: lo congelado está en la fila, y editar lo
  rompe de forma visible.
- Se gana no tocar el camino que ya funciona, con su red de tests intacta.
- Se pierde, temporalmente, la unidad conceptual: durante un tiempo habrá dos formas de generar. Está documentado
  aquí y en la fase 17 como decisión pendiente de confirmar, no como diseño final.
- Se pierde la posibilidad de que quien administra revise un guion ajeno para dar soporte. Es deliberado; si hace
  falta, se añade con su propia decisión y su propio registro de acceso, como el de los personajes.
- **Habrá que revisar** esta decisión cuando llegue la generación de las escenas aprobadas (0.19.0) y el montaje
  (0.22.0): son las dos versiones que dirán si «proyecto obligatorio salvo en Crear» aguanta o estorba.
