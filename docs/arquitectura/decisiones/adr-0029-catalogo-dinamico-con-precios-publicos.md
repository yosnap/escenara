# ADR-0029 · El catálogo se sincroniza con los precios que publica el proveedor

- **Estado:** propuesto (firme: el usuario elige cualquier modelo de su proveedor y ve su coste antes de generar; provisionales: el estado «precio publicado», la sincronización diaria, la frontera de las familias y que la variante se elija en el admin)
- **Fecha:** 2026-09-28
- **Versión del proyecto:** 0.23.0

## Contexto

Hasta la 0.22.x el catálogo de modelos era un **fichero versionado** (`catalogo.json`) con lo que alguien
había medido con su dinero. Eso da precios de fiar, pero deja fuera casi todo lo que ofrece el proveedor:
el propietario no podía elegir GPT Image 2 ni ver lo que cuesta, aunque su clave de KIE ya lo permitiera
(petición del propietario, 2026-09-28).

Lo que cambia el problema es un hecho comprobado ese mismo día: **KIE publica su tabla de precios en una API
sin clave y sin coste** (`POST https://api.kie.ai/client/v1/model-pricing/page`, 503 registros). Y esa tabla
**coincide con lo medido con dinero real**: `nano-banana-2-lite` 4 créditos por imagen; Hailuo 2.3 a 6 s y
768p, 30; MiniMax H3 a 8 créditos por segundo × 5 s, los 40 que cobró; Grok Imagine a 2,4 por segundo × 6 s,
los 14,4 que cobró; Gemini Omni 1.1 Flash a 4 s, los 63 que cobró. Es decir: **con la tarifa publicada se
puede estimar de verdad**, que es la única condición que pone la regla del dinero de este proyecto.

Quedan dos problemas que la tabla no resuelve sola:

1. `modelDescription` («gpt image 2, image-to-image, 1k») **no es** el identificador de `jobs/createTask`;
2. saber lo que cuesta un modelo no dice **con qué campos** se le pide, y cada familia recibe la referencia
   por un campo distinto (`image_urls`, `input_urls`, `image_url`, `image_input`, `reference_image_urls`).

## Opciones

- **Seguir a mano.** Cada modelo nuevo, una medición y un commit. Supuesto: los modelos útiles son pocos.
  Falla en cuanto el proveedor saca una familia al mes, que es lo que está pasando.
- **Importar todo y dejar elegir todo.** Supuesto: si el proveedor lo publica, se le puede pedir. Falla al
  primer modelo cuyos campos no conocemos: la petición se rechaza **después** de haberse cobrado.
- **Importar todo y dejar elegir solo lo que se sabe pedir** (la elegida).

## Decisión

1. **Estado nuevo `precio_publicado`**, elegible junto a `compatible` y `validado`. Se puede estimar,
   confirmar, reservar y generar con él, y en pantalla **se dice siempre** que ese precio lo publica el
   proveedor y no se ha medido aquí. `validado` sigue significando lo mismo que antes: medido y revisado con
   evidencia. El origen del precio es un hecho guardado (`model_prices.published`), no una frase dentro de
   su fuente.
2. **La correspondencia descripción → identificador de la API sale de la documentación, no de una
   suposición.** El parámetro `model` de la página del market (`?model=seedream%2F4.5-edit`) **es** el
   identificador de `createTask`, comprobado contra `docs.kie.ai`; cubre 215 de los 379 registros de imagen y
   vídeo. Los demás se resuelven con una tabla corta de página → identificador escrita a partir de la
   documentación de cada modelo. **Lo que no se resuelve por una de las dos no se importa.**
3. **Frontera del dinero: las familias.** El código declara, familia a familia y leído en la documentación,
   con qué campos se le pide a cada modelo. Un modelo con familia entra como `precio_publicado`; **un modelo
   sin familia entra igual, con su precio a la vista, pero no se puede elegir**, y la pantalla dice por qué.
   Ver el hueco es útil; enviar a ciegas cuesta dinero.
4. **La sincronización nunca pisa un precio medido.** Solo crea o actualiza filas marcadas como publicadas, y
   nunca cambia el estado, las capacidades ni la unidad de un modelo que ya existe: eso lo decide quien
   administra. Se hace sola una vez al día en el worker y con un botón en Admin › Modelos. No usa la
   credencial de nadie ni consume créditos.
5. **Un precio que cambia no toca ningún trabajo ya creado.** Sube la versión de su fila y con ella el sello,
   así que las estimaciones que alguien tuviera en pantalla quedan caducadas y hay que volver a confirmarlas
   antes de gastar. Los créditos ya consumidos son un hecho histórico.
6. **La variante se registra como una tarifa más.** Cuando el proveedor cobra distinto según la resolución o
   la calidad (GPT Image 2: 6 créditos a 1K, 10 a 2K, 16 a 4K), cada variante es una fila de `model_prices`
   con su propia unidad («imagen a 2K») y su propia versión. El registro de precios ya era único por
   proveedor, modelo y unidad, y **el sello ya llevaba la unidad dentro**, así que esto no toca el camino del
   dinero. Cuál se envía lo elige quien administra en Admin › Modelos, y cambiarla cambia a la vez lo que se
   pide y lo que se paga.
7. **Desviación entre lo publicado y lo cobrado.** Al cerrar un trabajo se apunta siempre el consumo real. Si
   difiere de la tarifa publicada en más de medio crédito, la diferencia queda en el historial del catálogo,
   agrupada por modelo y por cifra. **No corrige ningún precio por su cuenta**: decidir es de quien
   administra. El aviso al usuario sigue siendo el de siempre, el de exceso sobre lo apartado.

## Consecuencias

**Qué se gana.** El propietario elige GPT Image 2, Nano Banana 2 o Ideogram Character y ve lo que cuestan
antes de generar, sin haberlos medido antes. El catálogo deja de envejecer solo. Y la tabla publicada da una
segunda opinión sobre lo que cobra el proveedor, que antes no existía.

**Qué se pierde.** Un precio publicado es una promesa del proveedor, no un hecho comprobado aquí; puede no
cumplirse y por eso se avisa de la desviación. Y la lista de familias hay que mantenerla: un modelo nuevo se
ve enseguida, pero poder pedirlo sigue costando leer su documentación.

**Qué habrá que revisar.**

- **Que la variante la elija cada usuario por trabajo** y no quien administra para toda la instalación. La
  pieza que falta es que la unidad elegida viaje de la estimación a la confirmación, de ahí al trabajo y de
  ahí al despacho; hoy todos leen la misma del catálogo, que es lo que lo hace seguro.
- **APIMart en la 0.24.0**, con el mismo sistema si publica precios: el contrato de adaptadores ya tiene el
  hueco (`modelosPublicados`), y no lleva credencial porque la tabla de KIE es pública. Una tabla que exigiera
  clave necesitaría otra firma y otra decisión.
- **Música**, fuera de esta versión.
- **Las tarifas que no se pueden saber antes de generar** (por megapíxel, por millón de tokens) siguen fuera:
  un precio que no se conoce antes no se puede confirmar.
