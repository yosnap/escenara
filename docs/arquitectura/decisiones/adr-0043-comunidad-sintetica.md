# ADR-0043 · Comunidad solo sintética: elegibilidad por lista blanca de origen, copias moderadas y logros por hitos

- **Estado:** Aceptada para 0.49.0, corregida tras la revisión de código (la regla pasa a basarse en lo que cada
  trabajo envió). El alcance lo fijó el propietario (2026-09-30); lo marcado como provisional sigue pendiente de su
  revisión.
- **Versión:** 0.49.0
- **Fecha:** 2026-09-30

## Contexto

El propietario decidió que habrá comunidad, con un límite duro: **solo contenido sintético** (personajes inventados,
anuncios, trends y plantillas hechos con ellos), **nunca** fotos reales, personajes con fotos reales ni nada con una
persona real. Publicar es opt-in por elemento, con moderación previa del administrador. Hay retos y logros por hitos
reales, sin rachas; no hay comentarios, seguidores, mensajería ni publicación automática a redes.

El riesgo principal es que una persona real llegue a la galería por un camino indirecto: una foto subida como punto de
partida de un clip, una mascota real, un lugar fotografiado, un producto, un reparto de dos personas o un audio propio.
El segundo es que publicar deje rastros (prompts, modelos, correo, claves del almacenamiento) o que retirar no borre de
verdad.

## Opciones

1. **Marca de «sintético» declarada por el usuario.** Barata, y falsa en cuanto alguien se equivoca: nada la comprueba.
2. **Lista negra** de lo que no se puede (personas reales, fotos originales…). Cada camino nuevo de la aplicación
   (lugares, productos, canto) abre una puerta hasta que alguien la añade.
3. **Lista blanca de origen**: solo vale lo que se puede demostrar generado de principio a fin con un personaje
   inventado; todo lo demás, incluido lo que no se sabe de dónde viene, se rechaza.

Para la publicación: (a) enlazar el original y servirlo si está aprobado; (b) **copiarlo** a una publicación aparte.

## Decisión

**Lista blanca (3), reutilizando la de los ejemplos de plantilla**, y **copia (b)**.

- `condicionDeOrigenSeguro` (0.42.1) pasa a tener dos niveles. `ejemplo` es el de siempre. `comunidad` es más
  estricto y se basa en **hechos inmutables del trabajo**: lo que envió al proveedor, tal como quedó en su `input` al
  encolarse (todas las `referencias`, no solo la primera; `referenciasLugar`, `referenciasProducto`,
  `fotogramaSituado`, la imagen de partida y el `audioDeReferencia`) y, en Omni con identidad registrada (`personajesOmni`
  sin imágenes en el trabajo), el retrato y el cuerpo que subió **ese registro** (`character_omni_registrations` del
  mismo personaje) y las referencias de su versión registrada: sin registro, con el retrato borrado o con un cuerpo que
  se subió y cuyo medio ya no existe, «desconocido». Principio general: ninguna prueba desaparece al borrar un medio; lo
  que se usó y ya no existe cuenta como «no» (las referencias de la ficha caen en cascada, así que el inventado se juzga
  también por las de todas sus versiones, que son una lista sin clave ajena). Esa entrada es la procedencia fijada al generar:
  vaciar después un campo de la escena o borrar una foto no la cambia. Cada medio enviado, y lo que enviaron los
  trabajos que lo produjeron (consulta recursiva, cinco pasos como mucho), tiene que ser **resultado** de un trabajo de
  un personaje inventado con sus hechos en regla (sin reparto, sin producto aunque se haya borrado, con lugar generado o
  ninguno, sin canto, sin audio salvo una muestra de voz de la instalación) o la maestra de un lugar generado. **Cierra
  en falso**: un identificador ilegible, un medio borrado, una subida, un trabajo sin procedencia guardada o cualquier
  predicado que dé NULL cuentan como «no». El personaje inventado vale solo si **cada** referencia y su retrato maestro
  son resultado de un trabajo suyo (no se fía de la etiqueta `vista_generada`, que también lleva una subida declarada
  «hecha con IA»); lo mismo en todas sus versiones. El estado actual de la escena (reparto, canto, referencias) sigue
  como exclusión adicional, nunca como única prueba. Es una consulta grande: se ejecuta con `jit = off` local, porque la
  compilación JIT de PostgreSQL tardaba un segundo en una consulta que se resuelve en milisegundos.
- **Un único punto de verdad**: `server/comunidad/elegibilidad.ts` lo usan la interfaz (para explicar), el servidor al
  publicar (dentro de la transacción, con los bloqueos) y la moderación (otra vez, al aprobar). Las columnas que explican
  el «no» solo explican: nunca convierten un «no» en «sí».
- **Publicar = copiar**: fila en `community_posts` (título, descripción, firma, declaración expresa con su texto y fecha)
  y copias de los archivos en claves propias (`community_post_media`, `comunidad/<id>/…`), fuera de cualquier
  biblioteca. **Lista blanca de campos** hacia el navegador (`PublicacionVista`). Retirar borra la fila y apunta las
  copias en `storage_deletions` en la misma transacción (el worker reintenta lo que falle). El original no se toca.
- **Estado público en un solo sitio** (`visibilidad.ts`): aprobada, con original vigente y fuera de la papelera, con el
  personaje inventado del que sale (`origin_character_id`, fijado al publicar) con su declaración vigente **desde antes
  de la aprobación** (revocarla la oculta para siempre: la aplicación no deja volver a declarar un inventado; la fecha es
  una salvaguarda por si algún día se permitiera). El autor y quien modera la ven como «Oculta», con su motivo, autor sin borrado programado
  y la comunidad encendida. Lo aprobado no se recomprueba entero al mostrarlo: los hechos del trabajo no cambian, y
  estas comprobaciones baratas cubren lo que sí puede cambiar. El autor y quien modera la ven siempre. Borrar el original pone su enlace a nulo: la
  publicación queda huérfana, invisible al instante, y la pasada del worker la borra con su copia.
- **Moderación**: nadie modera lo suyo (403); se decide sobre una `revision` concreta (409 si el autor la cambió);
  editar devuelve a pendiente y vuelve a comprobar la elegibilidad. La cola enseña la **procedencia** de cada
  publicación (cada medio enviado, paso a paso, con su origen). Rechazar o retirar de la galería **borra la copia** en la
  misma transacción (apuntada en `storage_deletions`); corregir y reenviar la vuelve a copiar del original. El texto
  alternativo de la biblioteca no se publica. Bloqueos en el orden de siempre, usuario y después el original o la publicación, igual que
  los borrados de personaje, proyecto y cuenta: publicar↔borrar y aprobar↔retirar se serializan.
- **Borrar la cuenta**: en la gracia, sus publicaciones dejan de verse; al borrarla, las claves de sus copias se apuntan
  con las de sus medios y las filas caen en cascada. La exportación (`/api/comunidad/exportacion`) incluye las propias y
  se permite en la gracia; el ZIP de un proyecto lleva `comunidad.json` con las que salen de él.
- **Usar**: solo trends y plantillas. Abre «Crear» con la plantilla de la instalación elegida y la atribución; registra
  un uso por persona. **No copia archivos ni texto de prompt** (los prompts siguen ocultos). Personajes y clips solo se
  ven; de un personaje uno puede **inspirarse** (su descripción publicada, nunca sus imágenes). *Provisional.*
- **Logros**: `user_achievements` con clave primaria usuario y logro; cada hito sale de un hecho de la base de datos con
  su fecha. Se reconocen al abrir la comunidad (y la primera publicación, al aprobarla). El confeti sale una vez y
  respeta «reducir movimiento».
- **Retos**: los crea quien administra; participar es publicar con el reto (misma moderación).
- **Ajustes** en Admin › Ajustes › Comunidad: interruptor **apagado de fábrica**, normas editables y tope de pendientes.

## Consecuencias

- **Ningún anuncio con producto** es publicable: las fotos del producto son subidas (decisión del propietario: se
  mantiene así).
- Tampoco lo es un clip hecho en «Crear» a partir de una imagen subida, aunque sea una ilustración propia: la lista
  blanca no puede ver qué hay en una imagen.
- Los usuarios no pueden crear sus propios trends ni plantillas (sus prompts son de la instalación y están ocultos), así
  que «publicar un trend» es publicar un **ejemplo** hecho con un trend de la instalación. Abrir plantillas de usuario
  obligaría a decidir si su texto se enseña.
- Con un solo administrador, lo que él publique se queda pendiente para siempre (nadie modera lo suyo).
- Un clip Omni con identidad registrada vale solo si lo que subió su registro (retrato y cuerpo) es generado por ese
  inventado; quitar después esas fotos de la ficha no lo cambia, porque cuenta lo que se registró.
- La cola de moderación y la lista de candidatos calculan la elegibilidad de cuatro en cuatro: cada una abre
  transacciones y el grupo de conexiones del proceso web es pequeño.
- Las copias duplican almacenamiento (un clip publicado ocupa dos veces).
- Límites conocidos: lo que se generó antes de guardar en la entrada la lista de referencias no tiene procedencia y no
  se puede publicar; lo anterior a las columnas que conservan producto y lugar (0.26.0 y 0.46.0) se juzga con lo que
  quedó guardado; y la lista blanca no puede ver qué hay dentro de una imagen generada (para eso está la moderación).
