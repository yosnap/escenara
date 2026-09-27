# ADR-0023 · Motor de reglas de controles previos, y su precedencia sobre los modelos de decisión

- **Estado:** propuesto (decisiones provisionales del 2026-09-27, pendientes de confirmar por el propietario)
- **Fecha:** 2026-09-27
- **Versión del proyecto:** 0.18.0

## Contexto

Entre la 0.10.0 y la 0.17.0 se fueron añadiendo comprobaciones previas a gastar, cada una donde hacía falta en
ese momento: la credencial y el saldo en `generacion/comprobaciones.ts`, el consentimiento y el mínimo de
referencias en `personajes/puede-generar.ts`, el modelo y su precio en `generacion/precios.ts`, la cuota en la
biblioteca, los topes en `presupuesto/reserva.ts` y la aprobación del plan en `asistente/plan.ts`. Todas
funcionan. El problema no es ninguna de ellas, es el conjunto:

- **nadie puede responder «¿puedo generar?» en una sola lectura.** La respuesta está repartida en siete ficheros
  y solo se descubre pulsando el botón, que es exactamente cuando ya se ha decidido gastar;
- **el orden en que fallan es el orden en que se escribieron**, no el orden en que le importan a quien paga;
- **cada una responde a su manera**: unas con 409, otras con 402, unas con la acción dentro del motivo y otras
  sin acción;
- y **la siguiente comprobación se añadirá en un octavo sitio**, porque no hay ninguno que sea «el sitio».

RF12 pide justo eso: antes de gastar, una pantalla que diga **Listo**, **Necesita ajustes**, **Requiere
revisión** o **Bloqueado**, con el motivo y la siguiente acción. Y RF13 (0.24.0) pedirá guardar con qué se
decidió, lo que exige una **versión del conjunto de reglas**.

Hay además una restricción que viene de ADR-0016 y de seis versiones de tests: el camino que reserva presupuesto
y encola es el código más revisado del repositorio. Unificar no puede significar reescribirlo.

## Opciones

1. **Dejar las comprobaciones donde están y añadir una función que las llame en orden para mostrar el panel.**
   Supone que un panel de lectura y una puerta de escritura pueden compartir las mismas funciones. Falla en lo
   primero que se intenta: esas funciones **lanzan** en lugar de devolver, así que el panel solo podría enseñar
   el primer freno, y varias de ellas **consumen** algo al comprobarlo (el límite de ritmo) o solo se pueden
   ejecutar dentro de una transacción (el presupuesto). Y sobre todo: seguirían siendo siete sitios.
2. **Un motor de reglas configurable desde la interfaz, con editor.** Supone que las reglas de gasto y de
   consentimiento son configuración. Falla donde más duele: una regla editable desde un panel es una puerta de
   dinero y de derechos de imagen que se puede abrir sin pasar por una revisión de código, y el propietario ya
   decidió lo contrario para el resto de la configuración sensible (la clave maestra, la lista blanca de
   rechazos).
3. **Un motor de reglas en el código, puro y determinista, que evalúa una estructura de hechos ya cargados, con
   sus parámetros en Admin › Ajustes.** Supone que se puede separar «leer los hechos» de «decidir con ellos».
   Falla si los hechos que aporta la puerta y los que aporta el panel divergen, o si alguien olvida aportar un
   grupo de hechos y sus reglas dejan de evaluarse en silencio.

## Decisión

Se elige la **opción 3**, con dos salvaguardas contra la forma en que falla.

### Forma del motor

- **`server/controles/motor.ts` es el único sitio donde se decide si algo se puede generar.** Es una función
  pura: recibe unos hechos y devuelve un estado global y la lista de frenos, cada uno con su clave de regla, su
  estado, su motivo, su acción, su código HTTP y la familia de excepción con la que se rechaza. No consulta
  nada, no cuesta nada y para la misma entrada devuelve siempre lo mismo.
- **`server/controles/hechos.ts` es el único sitio donde se leen los hechos**, y lo usan las dos orillas: la
  puerta del encolado y la lectura del panel. Así el panel no puede decir «listo» mirando cosas distintas de
  las que mira quien cobra.
- **`server/controles/puerta.ts` es la única puerta.** Evalúa, guarda la evaluación y rechaza. El encolado de
  0.12.0 pasa por ella y **no se puede encolar sin una evaluación favorable** (o con un aviso confirmado).
- Las comprobaciones que se han movido conservan **su mensaje y su código HTTP**, y las que no se han movido no
  están duplicadas aquí (ver «Lo que no es del motor»).

### Las dos salvaguardas

1. **Un grupo de hechos que falta no se evalúa** —lo que permite mirar una escena del plan antes de haber
   elegido modelo—, pero **la puerta exige que estén todos** antes de dejar encolar y responde 500 si falta
   alguno. Olvidarse de un grupo es un error de programación, no una configuración permisiva.
2. **Un test comprueba en el código que todo fichero que llama al encolado pasa por la puerta**, y un test de
   integración comprueba contando que cada trabajo encolado deja exactamente una evaluación guardada.

### Los cuatro estados y quién los salva

- **Listo**: se puede generar.
- **Necesita ajustes**: se puede generar **confirmando expresamente ese aviso**. La confirmación viaja en la
  petición por la clave de la regla y **entra en la firma de idempotencia del cliente**, así que confirmar un
  aviso distinto es otra confirmación y estrena clave. Una excepción declarada: el coste que no se puede acotar
  avisa y **no pide confirmación**, porque desde 0.12.0 el trabajo queda `esperando_limite` y no sale hasta que
  el usuario fija su techo; ese paso **es** la acción del aviso.
- **Requiere revisión**: hace falta que el usuario **aporte algo** (volver a aprobar el plan, verificar una
  afirmación con su fuente). No se salva con una casilla.
- **Bloqueado**: **no se salta nunca**, tampoco desde la API. La puerta ignora cualquier confirmación que llegue
  para una regla bloqueante, y el motor corrige a «no confirmable» cualquier freno que no sea un aviso, por si
  quien escribiera una regla nueva lo marcara mal.

### Reglas en el código, parámetros en el panel

No hay editor de reglas. Lo configurable en Admin › Ajustes son **umbrales de avisos**:
`controlesExigirCoberturaVistas`, `controlesExigirPrecioFresco` y `controlesMaximoAvisos`. Los frenos duros
—credencial, consentimiento, formato del modelo y presupuesto— **no son configurables a propósito**: se apagan
cambiando el código y revisándolo.

### Precedencia sobre los modelos de decisión (prepara 0.24.0)

**Las reglas mandan.** El contrato de decisiones (`server/decisiones/`, hoy reglas deterministas; en 0.24.0 un
servicio con Jev y Laya) se consulta **después** del motor y **solo puede añadir** un rechazo, nunca levantar un
freno. Un modelo de decisión que dijera «aprobado» sobre un trabajo sin consentimiento vigente no cambiaría
nada: el motor ya lo habría bloqueado, y por eso se evalúa primero.

El motivo es de responsabilidad, no de desconfianza: un freno del motor es una afirmación objetiva y
reproducible (no hay clave, no hay consentimiento, no cabe en el presupuesto) y tiene que poder demostrarse ante
quien reclame. Un veredicto de un modelo es una opinión con evidencia escrita, y una opinión no autoriza a
enviar la cara de una persona a un proveedor.

### Lo que no es del motor

El motor evalúa el **estado del sujeto**. La **validación de la petición** se queda donde está: limpieza del
prompt, casillas declarativas (derechos de imagen, revisión de referencias), coste confirmado, sello del precio,
clave de idempotencia y límite de ritmo. Dos razones:

- no son estados que se puedan mostrar en un panel antes de pulsar: dependen de lo que se está mandando;
- y el límite de ritmo **consume** cuota al comprobarse, así que no puede estar en una evaluación de lectura:
  mirar el panel gastaría ritmo.

### Lo que queda guardado

Cada evaluación que abre o cierra una puerta deja una fila en `control_evaluations`: sujeto (escena o trabajo),
estado, reglas disparadas con su motivo y su acción, **versión del conjunto de reglas**, avisos confirmados y
fecha. Las lecturas del panel **no** se guardan: llenarían la tabla de ruido sin nada que auditar.

## Consecuencias

**Se gana:**

- una respuesta a «¿puedo generar?» que se puede leer **antes** de decidir gastar, con el motivo y la acción de
  cada freno y sin haber tocado un céntimo;
- un solo sitio que cambiar cuando cambie una regla, y una versión con la que auditar lo que se decidió;
- las reglas de la escena aplicadas de verdad en el plan del proyecto, con el **mismo** código que las aplica al
  producir, así que el estado que se ve no es una promesa;
- los frenos de personaje y de proyecto dejan de convertirse en «error interno» al pasar por la API de
  generación: cada uno responde con su motivo y su código.

**Se pierde:**

- una indirección más entre el servicio y sus comprobaciones. Leer `crearFotograma` ahora exige saber que los
  frenos están en el motor;
- la evaluación del encolado hace algunas lecturas antes que antes (cuota y presupuesto se leían más tarde). Son
  lecturas indexadas y la del saldo tiene su caché de 30 s, pero hay que vigilarlo si el encolado se acelera.

**Habrá que revisar:**

- **el aviso de cobertura de vistas viene apagado de fábrica**, porque encendido añade una confirmación a un
  flujo ya en uso. Si el propietario decide que generar con un personaje sin todas sus vistas deba confirmarse
  siempre, se enciende y se actualizan los tests de personajes que hoy generan con fichas sin vistas
  clasificadas;
- **el clip no vuelve a mirar la aprobación de la escena** del fotograma que anima; sí su presupuesto. Si en
  0.19.0 producir una escena pasa a encadenar fotograma y clip sin intervención, hay que decidir si la
  aprobación se revalida entre los dos;
- **la reevaluación del despacho** solo mira las reglas que pueden cambiar sin que el usuario pida nada
  (consentimiento y referencias del modelo): las de dinero no, porque la reserva ya está apartada y compararlas
  otra vez rechazaría el trabajo por su propio apartado;
- y **la precedencia de esta decisión frente a 0.24.0**: si un día un modelo de decisión tuviera que poder
  levantar un aviso, sería otro ADR y no un cambio de código.
