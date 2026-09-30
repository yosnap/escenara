# ADR-0043 · Comunidad solo sintética: elegibilidad por lista blanca de origen, copias moderadas y logros por hitos

- **Estado:** Aceptada para 0.49.0. El alcance lo fijó el propietario (2026-09-30); las decisiones técnicas marcadas
  como provisionales quedan pendientes de su revisión.
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
  estricto: sin subidas directas, personaje **inventado** y sin ninguna foto original (una mascota real no vale), trabajo
  sin producto (se mira lo que conserva el trabajo aunque el producto se borre) y con lugar generado o ninguno, **toda la
  cadena de imágenes de partida** resultado de trabajos así (consulta recursiva, cinco pasos como mucho), y escenas sin
  audio propio, imagen de referencia, producto ni lugar con fotos. Un personaje es publicable si es inventado, con su
  declaración vigente y sin ninguna imagen de ninguna versión que no sea una vista generada suya.
- **Un único punto de verdad**: `server/comunidad/elegibilidad.ts` lo usan la interfaz (para explicar), el servidor al
  publicar (dentro de la transacción, con los bloqueos) y la moderación (otra vez, al aprobar). Las columnas que explican
  el «no» solo explican: nunca convierten un «no» en «sí».
- **Publicar = copiar**: fila en `community_posts` (título, descripción, firma, declaración expresa con su texto y fecha)
  y copias de los archivos en claves propias (`community_post_media`, `comunidad/<id>/…`), fuera de cualquier
  biblioteca. **Lista blanca de campos** hacia el navegador (`PublicacionVista`). Retirar borra la fila y apunta las
  copias en `storage_deletions` en la misma transacción (el worker reintenta lo que falle). El original no se toca.
- **Estado público en un solo sitio** (`visibilidad.ts`): aprobada, con original vigente y autor sin borrado programado,
  y la comunidad encendida. El autor y quien modera la ven siempre. Borrar el original pone su enlace a nulo: la
  publicación queda huérfana, invisible al instante, y la pasada del worker la borra con su copia.
- **Moderación**: nadie modera lo suyo (403); se decide sobre una `revision` concreta (409 si el autor la cambió);
  editar devuelve a pendiente. Bloqueos en el orden de siempre, usuario y después el original o la publicación, igual que
  los borrados de personaje, proyecto y cuenta: publicar↔borrar y aprobar↔retirar se serializan.
- **Borrar la cuenta**: en la gracia, sus publicaciones dejan de verse; al borrarla, las claves de sus copias se apuntan
  con las de sus medios y las filas caen en cascada. La exportación (`/api/comunidad/exportacion`) incluye las propias.
- **Usar**: solo trends y plantillas. Abre «Crear» con la plantilla de la instalación elegida y la atribución; registra
  un uso por persona. **No copia archivos ni texto de prompt** (los prompts siguen ocultos). Personajes y clips solo se
  ven; de un personaje uno puede **inspirarse** (su descripción publicada, nunca sus imágenes). *Provisional.*
- **Logros**: `user_achievements` con clave primaria usuario y logro; cada hito sale de un hecho de la base de datos con
  su fecha. Se reconocen al abrir la comunidad (y la primera publicación, al aprobarla). El confeti sale una vez y
  respeta «reducir movimiento».
- **Retos**: los crea quien administra; participar es publicar con el reto (misma moderación).
- **Ajustes** en Admin › Ajustes › Comunidad: interruptor **apagado de fábrica**, normas editables y tope de pendientes.

## Consecuencias

- Hoy **ningún anuncio con producto** es publicable: las fotos del producto son subidas. Admitirlos (un producto sin
  personas, con derechos declarados) sería relajar la regla y es decisión del propietario.
- Tampoco lo es un clip hecho en «Crear» a partir de una imagen subida, aunque sea una ilustración propia: la lista
  blanca no puede ver qué hay en una imagen.
- Los usuarios no pueden crear sus propios trends ni plantillas (sus prompts son de la instalación y están ocultos), así
  que «publicar un trend» es publicar un **ejemplo** hecho con un trend de la instalación. Abrir plantillas de usuario
  obligaría a decidir si su texto se enseña.
- Con un solo administrador, lo que él publique se queda pendiente para siempre (nadie modera lo suyo).
- Llevar a la papelera el original no retira la publicación (solo el borrado definitivo). Es una copia independiente.
- Las copias duplican almacenamiento (un clip publicado ocupa dos veces).
- Límites conocidos, heredados de la lista blanca de ejemplos: no se inspeccionan imágenes que un trabajo mandó en su
  `input` distintas de su imagen de partida; y lo que se generó antes de las columnas que conservan producto y lugar
  (anteriores a 0.26.0 y 0.46.0) se juzga con lo que quedó guardado.
