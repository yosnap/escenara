# Fotos de Lupo, el perro inventado del tutorial

Lupo no existe. Hacen falta **4 fotos** (el mínimo del alta es 3) del mismo perro, con luces y ángulos distintos,
como las que subiría alguien de su mascota real. Van a `mascota/fotos/` con estos nombres, en JPG y de al menos
1024 px de lado: `lupo-1.jpg`, `lupo-2.jpg`, `lupo-3.jpg` y `lupo-4.jpg`. La grabación `mascota` las sube con
«Subir desde el equipo».

## Por qué fuera del alta

Si se eligen desde la biblioteca después de generarlas en Escenara, la app las registra como «vista generada»
(`apps/web/src/server/personajes/servicio.ts:361-462`). Entonces no cuentan como fotos para el mínimo de 3. Se
generan, se descargan y se suben como ficheros. Cualquiera de estas dos vías vale:

1. **En Escenara, desde «Crear»** (fotograma, `nano-banana-2-lite`) con la cuenta Tutoriales. Después se
   descarga cada imagen desde la biblioteca y se guarda con su nombre.
2. **En el área de pruebas de KIE**, con el mismo modelo.

Para que salga el mismo perro en las cuatro, genera primero la 1 y, si la herramienta lo permite, úsala como
imagen de referencia en las otras tres. Si no lo permite, repite los rasgos fijos y quédate con las cuatro que
más se parezcan.

## Lo que cuesta

- `nano-banana-2-lite`: 4 créditos por imagen, según los trabajos del vídeo anterior en `usage_ledger`.
  Las 4 fotos cuestan **16 créditos**; con solo 3, 12.
- En «Crear», si NaN builders no responde y la traducción del texto cae en KIE, se suman hasta 2 créditos por
  imagen, como mucho 8 más.
- Se generan una sola vez. Las pasadas siguientes reutilizan los mismos ficheros.

## Textos

Rasgos fijos, en todas: perro mestizo de tamaño mediano, pelo corto color canela, mancha blanca en el pecho,
orejas caídas, ojos marrones y collar rojo sin chapa ni texto.

1. **lupo-1, de frente y sentado**: «Foto realista hecha con móvil de un perro mestizo de tamaño mediano, pelo
   corto color canela, mancha blanca en el pecho, orejas caídas, ojos marrones y collar rojo liso. Sentado de
   frente en el suelo de madera de un salón, mirando a cámara, con luz natural de ventana. Sin personas ni texto.»
2. **lupo-2, de perfil en un parque**: «El mismo perro (imagen de referencia) de perfil, de pie sobre el césped
   de un parque por la tarde, con luz cálida lateral. Cuerpo entero. Sin personas ni texto.»
3. **lupo-3, tres cuartos en el sofá**: «El mismo perro (imagen de referencia) tumbado en un sofá gris, en tres
   cuartos, con la cabeza apoyada en un cojín y luz suave de lámpara. Sin personas ni texto.»
4. **lupo-4, primer plano en la calle**: «El mismo perro (imagen de referencia) en primer plano de la cabeza,
   ligeramente desde arriba, en una acera con luz de día nublado. Sin personas ni texto.»

Revisa que en ninguna aparezcan personas, manos, matrículas, carteles legibles ni marcas de agua.
