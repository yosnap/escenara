# Con qué se genera cada cosa (mapa de modelos)

Desde la 0.21.1, en **«Tu cuenta»** decides con qué se genera cada tipo de cosa y **en qué orden**. A eso lo
llamamos tu mapa de modelos.

Para cada tipo hay una lista:

- la **primera opción** es la principal, la que se usa siempre que funcione;
- las siguientes son **reservas**: se prueban solas, sin preguntarte, cuando la anterior falla.

![Mapa de modelos: una lista por tipo y la regla para pasar a la reserva sin un segundo cargo](../assets/diagramas/mapa-de-modelos.svg)

Desde la 0.22.0 el mapa cubre **los cinco tipos**, imagen y vídeo incluidos:

| Tipo | Para qué | Quién puede estar |
|---|---|---|
| **Texto** | Traducir tus prompts al inglés y escribir el guion con el asistente | Modelos de texto del catálogo con tu clave, y tus servicios compatibles con OpenAI |
| **Voz** | Leer el diálogo cuando el proyecto usa pista de voz aparte | Modelos de voz del catálogo con tu clave, y `kokoro` en tus servicios compatibles |
| **Subtítulos** | Sacar los subtítulos del audio ya generado | Esta instalación (gratis) y `whisper` en tus servicios compatibles |
| **Imagen** | Los fotogramas de tus escenas, las imágenes de «Crear» y las vistas generadas de tus personajes | Modelos de imagen del catálogo con tu clave |
| **Vídeo** | Los clips de tus escenas y, en modo Omni, las escenas habladas | Modelos de vídeo del catálogo con tu clave |

En imagen y vídeo **no aparecen los servicios compatibles con la API de OpenAI**: esos son de texto, voz y
transcripción, y ofrecerlos aquí sería ofrecer algo que no saben hacer.

Cuando en «Crear» eliges tú el modelo a mano, **manda tu elección** para ese envío: es una decisión tuya sobre
ese trabajo concreto, y por eso no hay reservas detrás (no has visto lo que costaría en ninguna otra).

## Si no tocas nada

Se usa **lo que recomienda esta instalación**, recortado a las claves que tengas. Es lo que ves arriba de cada
lista, y lo que hacía Escenara antes de que el mapa existiera. En cuanto cambias algo, manda tu orden; si te
arrepientes, «Volver a lo recomendado» lo deja como estaba.

## Cuándo se pasa a la siguiente opción

**Solo cuando se ha probado que la anterior no te ha cobrado.** Esa es la regla y no tiene excepciones
convenientes:

- si el proveedor **rechazó la petición** (clave que no vale, cuenta sin saldo, demasiadas peticiones seguidas),
  se sabe que no hubo cargo y se prueba la siguiente;
- si **no contestó**, tardó demasiado o devolvió un error suyo, **no se sabe** si ha cobrado. Entonces no se
  encadena con otra opción de pago: se para y se te dice con esas palabras, para que puedas mirar tu cuenta
  antes de volver a pedirlo.

Hay una excepción, y es por el mismo motivo: si la siguiente opción **no cobra por petición** (los servicios que
se pagan con la cuota de tu plan), seguir no puede crearte un segundo cargo, así que sí se prueba. Es lo que
hace que un proveedor que se queda colgado no te deje el trabajo sin hacer.

## Lo que cuesta cada opción

Los créditos de dos proveedores **no valen lo mismo ni miden lo mismo**, así que Escenara nunca los suma ni los
compara. Cada opción enseña su coste **en su propia moneda**.

Lo que confirmas antes de generar es el coste de la **opción principal**. Una reserva nunca te cuesta más de lo
que viste para ella: si al llegar el momento costara más, no se cambia y se te dice por qué, con la cifra.

Los servicios que se pagan por cuota del plan cuentan **0 créditos**: no es una estimación, es que no cobran por
petición. De sus llamadas se guardan los **tokens**, que es lo único que mide de verdad cuánta cuota has gastado.

## De dónde sale el precio que ves

Desde la 0.23.0 hay dos orígenes, y **siempre se dice cuál es**:

- **Medido en esta instalación.** Alguien generó de verdad con ese modelo y anotó lo que costó. Es el precio de
  los modelos marcados como «validado».
- **Publicado por el proveedor.** Sale de su propia tabla de precios, que Escenara lee sola una vez al día sin
  usar tu clave y sin gastarte un crédito. Son los modelos marcados como **«precio publicado»**: puedes elegirlos
  y confirmarlos como cualquier otro, con el aviso de que ese precio lo dice el proveedor y no lo hemos
  comprobado aquí. Si al terminar el trabajo cobra otra cosa, se apunta lo que ha cobrado de verdad y la
  diferencia queda registrada.

Gracias a eso, en tu mapa aparecen **todos los modelos que tu proveedor ofrece y esta instalación sabe pedir**, no
solo los que alguien midió antes. Un modelo que el proveedor publica pero cuyos parámetros no conocemos se ve en
Admin › Modelos con su precio, y **no se puede elegir**: se dice por qué.

Algunos modelos cuestan distinto según lo que se les pida (una imagen a 1K, 2K o 4K, o en calidad rápida o
cuidada). Cada una de esas variantes tiene su precio, y cuál se envía lo decide quien administra la instalación
desde Admin › Modelos. Si cambia, el coste que tuvieras en pantalla se marca como caducado y hay que volver a
confirmarlo antes de generar: nunca se gasta con una cifra que ya no vale.

## Servicios compatibles con la API de OpenAI

Más abajo en «Tu cuenta» puedes añadir servicios que hablan la API de OpenAI (por ejemplo NaN builders). De cada
uno hacen falta cuatro cosas: un **nombre** (el que verás en los avisos), su **dirección base** (la que acaba en
`/v1`), tu **clave** y su **lista de modelos, en el orden en que quieras probarlos**.

- La dirección tiene que ser **https** y apuntar a un servidor público de internet. Es la única dirección que
  escribes tú, así que se comprueba al guardarla y en **cada** llamada.
- Al guardar se prueba pidiendo su lista de modelos, que **no consume cuota**.
- Tu clave se guarda cifrada y no se vuelve a mostrar: solo sus cuatro últimos caracteres.

## Un detalle de la voz: las voces no son intercambiables

Cada proveedor de voz tiene **sus** identificadores de voz. Los de ElevenLabs son cadenas largas; los de
`kokoro` son nombres como `ef_dora`. Una opción de otra familia **no puede leer** la voz que tengas fijada en el
proyecto, así que no se usa como reserva: cambiar de familia por su cuenta cambiaría el timbre del personaje a
mitad de proyecto. Cuando pasa, el mensaje lo dice con esas palabras.

Si quieres usar `kokoro`, elige también una de **sus** voces en la pantalla de voz del proyecto.

## Cuando algo falla

El mensaje te dice **las cuatro cosas**: qué falló de verdad (qué proveedor, qué modelo y con qué causa
concreta), si se te ha cobrado o no se sabe, qué se intentó después y qué puedes hacer. Por ejemplo:

> No se ha podido traducir tu texto al inglés, así que no se ha enviado nada a generar y no se te ha cobrado la
> generación: KIE.ai (gpt-5-6-sol) ha tardado demasiado en responder (tras 90 s). No se sabe si te ha cobrado,
> así que no se ha vuelto a enviar nada. Se probó entonces con NaN builders (gemma4) (máximo 5 peticiones
> simultáneas). No se te ha cobrado nada. Se probó entonces con NaN builders (deepseek-v4-flash) (la cuota del
> plan está agotada; la cuota se repone el 2026-10-01). No se te ha cobrado nada.

Nunca verás «vuelve a intentarlo en un momento» a secas: eso no dice ninguna de las cuatro.
