# ADR-0032 · El brief del anuncio vive en el proyecto, y un proyecto es un anuncio

- **Estado**: aceptada
- **Fecha**: 2026-09-28
- **Versión**: 0.27.0
- **Relacionadas**: ADR-0022 (el prompt lo compone el servidor y no sale hacia el navegador), ADR-0030
  (coherencia: percibir, decidir, registrar), ADR-0031 (composición del prompt dirigido)

## Contexto

Hasta la 0.26.x no había **ningún sitio** donde se decidiera a quién le habla un anuncio ni qué se le ofrece. El
guion nacía de `projects.idea` —una frase libre— y de ahí salía `scenes.script_text`. Todo lo que Escenara sabía
hacer bien estaba en la tercera palanca de un anuncio: dirigir el clip (0.25.0), el producto (0.26.0), la voz.

El principio de producto que entra en esta versión dice que eso es lo que menos pesa: el **ángulo** (a quién le
hablas y desde qué dolor o deseo) es el 80 % del resultado, la **oferta** empaqueta lo que se da, y la
creatividad amplifica las dos pero no salva un anuncio con mal ángulo. Y hay una regla dura: **un solo ángulo por
vídeo**.

Poner eso en el producto obliga a decidir **dónde vive**. Tres restricciones marcan la decisión:

1. **Un ángulo tiene que ser uno**, no «uno recomendado». Si el modelo de datos admite dos, alguien guardará dos,
   y el guion los mezclará: es el error que la versión existe para evitar.
2. **Quien ya tiene su guion no puede quedarse fuera.** La 0.26.x está publicada y en uso. Un brief obligatorio
   rompería a todos los proyectos existentes.
3. **Probar doce ángulos del mismo producto es el caso normal**, no la excepción: es así como se encuentra el que
   funciona.

## Opciones

### A. El brief en la escena

Cada escena declara su ángulo y su oferta.

- **Supuesto**: la unidad de trabajo del usuario es la escena, que es donde ya vive la dirección del clip.
- **Dónde falla primero**: doce escenas pueden declarar doce ángulos distintos, y el vídeo resultante mezcla
  todos. La regla de «un solo ángulo» dejaría de ser una columna escalar y pasaría a ser una validación
  transversal que alguien tendría que recordar aplicar. Además la oferta se repetiría escena a escena y se
  desincronizaría a la primera edición.

### B. El brief en una entidad «campaña» por encima del proyecto

Una campaña agrupa proyectos y guarda el producto, la oferta y la lista de ángulos.

- **Supuesto**: el usuario piensa en campañas antes de pensar en vídeos.
- **Dónde falla primero**: añade una jerarquía entera —pantallas, permisos, borrado en cascada, navegación— antes
  de saber si el brief se usa. Y obliga a crear una campaña para hacer **un** anuncio, que es por donde empieza
  todo el mundo. La medición por campaña, que es lo que justificaría la entidad, no existe todavía en Escenara.

### C. El brief en el proyecto, y las variantes como proyectos hermanos

`ad_briefs` con `project_id` único; `projects.variant_group_id` agrupa los hermanos del mismo producto y oferta, y
`projects.angle_preset_key` guarda el ángulo denormalizado.

- **Supuesto**: un proyecto **es** un anuncio, así que tiene un ángulo.
- **Dónde falla primero**: comparar doce variantes exige leer doce proyectos, y cambiar la oferta no se propaga
  «a la campaña» porque no hay campaña —se propaga porque la oferta es una fila compartida—.

## Decisión

**Opción C.** Un proyecto es un anuncio y tiene, como mucho, **un** brief y **un** ángulo.

Lo que la sostiene, punto por punto:

- **Un solo ángulo es el esquema, no una regla.** `ad_briefs.angle_preset_key` es una columna escalar: dos a la
  vez no se pueden ni guardar. La interfaz ofrece elección única y la API rechaza una lista **diciendo por qué**,
  para que un error de tipos se lea como una frase y no como un 400 vacío.
- **El brief es opcional y no bloquea nada.** Sin fila en `ad_briefs`, el proyecto se comporta exactamente como en
  la 0.26.x. La puerta del guion solo exige algo cuando **hay** brief: lo que impide es que un brief a medias se
  convierta en una petición de pago que iba a salir mal.
- **La oferta es una entidad aparte** (`offers`), atada a un producto y reutilizable: la misma sirve para las doce
  variantes y se edita en un sitio. Se borra en lógico, porque el guion que salió de ella ya existe. Y se puede
  duplicar a otro producto, que es lo que pasa cuando la promoción es la misma y el producto no.
- **Los campos vacíos de la oferta no viajan al modelo.** No como cadena vacía: **no aparecen**. A un modelo al
  que se le pasa «garantía: (vacío)» se le está invitando a inventar una garantía, y una garantía inventada es una
  promesa que alguien tendría que cumplir.
- **Las variantes son proyectos hermanos** con `variant_group_id` común y un ángulo cada uno, creados con una sola
  confirmación de coste agregada. Lo que se crea es texto: ningún clip.
- **El hook es el primer turno del guion**, no un campo suelto (decisión 10 de la fase). Así la dirección del clip
  lo consume como consume el resto del guion y no hay una segunda copia que se desincronice.
- **El ángulo se comprueba con el sujeto `proyecto`**, no con la escena: una escena suelta no puede decir si el
  anuncio mezcla dos ángulos, que es justo lo que hay que detectar. Empieza **en sombra**, como el resto de la
  coherencia (ADR-0030).
- **El catálogo de ángulos lo amplía quien administra**, como presets versionados de la categoría
  `angulo-anuncio`. No `angulo`, que ya es el ángulo de cámara de la dirección del clip: compartir clave habría
  mezclado los dos catálogos en la misma botonera. Un usuario no crea ángulos propios porque la definición del
  ángulo es la **referencia** con la que se comprueba el guion; duplicar uno se rechaza con su motivo.

## Consecuencias

**Lo que se gana.** El guion deja de nacer de la nada: entra con un ángulo, un público, una versión mejor de sí
mismo y una oferta concreta. La regla de un solo ángulo es inviolable por construcción. Quien ya tenía proyectos no
nota nada. Y probar doce ángulos cuesta doce llamadas de texto, no doce briefs copiados a mano.

**Lo que se pierde.** Comparar variantes exige recorrer proyectos hermanos, y no hay una pantalla de campaña que
los enseñe juntos con sus resultados: hoy solo se listan los hermanos del grupo con su ángulo. Y el veredicto del
ángulo no mide acierto todavía, porque en sombra depende de que la gente corrija.

**Qué habrá que revisar.**

- **La medición real en campaña.** Conectar con plataformas de anuncios y comparar ángulos por resultados está
  anotado en la hoja de ruta sin versión asignada. Si entra, quizá sí aparezca una entidad por encima del
  proyecto; el `variant_group_id` es el enganche por el que entraría.
- **El tope de doce variantes** está fijo en el código (`MAXIMO_VARIANTES`) y es el tamaño del catálogo de
  fábrica. Si el admin añade ángulos, el tope deja de coincidir con el catálogo y habrá que decidir si sube, si se
  configura o si se queda como límite por tanda.
- **Los cuatro ángulos que piden declaración** (mecanismo, beneficio, miedo, comparación) son una decisión de
  producto pendiente de la revisión legal de la 0.46.0. Quién la exige lo dice cada preset, no una lista en el
  código, precisamente para poder cambiarlo sin desplegar.
- **Pasar `angulo_fiel` de sombra a activa** cuando el panel de acierto lo respalde, como el resto de las
  comprobaciones.
