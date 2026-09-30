# Crear un personaje animado

Un personaje animado es **inventado**: no representa a una persona real. Puedes usarlo en ilustración plana,
3D estilizado o anime. La misma cara y el mismo acabado se conservan entre escenas mediante un retrato maestro.

## Preparar el personaje

1. En **Personajes › Nuevo › Inventado**, escribe nombre y descripción. Confirma la declaración de que no
   representa a nadie real.
2. En **Estilo visual**, elige uno de los tres acabados. Puedes precisar paleta, trazo, detalle y hasta tres
   referencias *descriptivas*. Evita nombres de personas reales, obras o estudios concretos.
3. Guarda el personaje. El texto del estilo activo se conserva con la versión de su ficha aunque quien
   administra edite el preset después.
4. Genera entre **uno y cuatro retratos candidatos** tras revisar el coste por imagen y el total. Elige el que mejor establezca
   cara, silueta y colores: será el **retrato maestro**. Los demás siguen en tu biblioteca.
5. Completa al menos **dos vistas generadas** del mismo personaje y aprueba las que vayas a usar. El maestro y
   esas dos vistas bastan para empezar una escena; las otras vistas siguen recomendadas y el aviso se puede
   confirmar expresamente si faltan.

Un personaje real no muestra este control ni puede adquirirlo por API. Para animar un personaje inventado no se
admiten fotos reales: el maestro debe proceder de una generación de ese personaje.

## Crear escenas

Al elegir el personaje como protagonista, el proyecto hereda su acabado. Las escenas y los planos de recurso
lo incorporan al prompt sin que tengas que repetirlo. Primero aprueba el fotograma de cada escena y después
anímalo: el maestro guía la identidad y Jev compara contra él. Cámara, gesto, guion y voz se eligen como en un
proyecto normal. Con Hailuo 2.3 Standard puedes pedir clips de **6 segundos**; ese modelo produce la escena
sin voz, por lo que una locución se añade por la ruta de voz del proyecto o en el montaje.

Si **falta un retrato maestro**, vuelve a la ficha y aprueba un candidato. Si **el estilo no coincide** con
el del proyecto, elige un personaje del mismo acabado o inicia otro proyecto. Si cambias el estilo o la guía,
las vistas anteriores dejan de guiar nuevas generaciones y tendrás que aprobar un retrato nuevo. Los medios
ya generados permanecen en la biblioteca.

## Coste y transparencia

Elegir un estilo, escribir su guía, crear el personaje y montar clips no consume créditos. Cada retrato,
fotograma, clip o voz de proveedor muestra su estimación y pide confirmación antes de reservar. Los importes
dependen del modelo y de la duración; consulta el precio vigente en la pantalla antes de confirmar.

La etiqueta visible de **contenido sintético** sigue siendo obligatoria al exportar, incluso si el proyecto
es completamente animado. Esta regla de producto se mantiene hasta la revisión legal prevista para 0.41.0;
no atribuyas al dibujo una excepción legal automática. Consulta también [Montaje y exportación](montaje-y-exportacion.md).

## Ejemplos guardados

En la cuenta de administración están los proyectos [Nora en dos escenas](/proyectos/8ee8d990-e52e-4e08-ba58-52d71ac5b461),
[Bruno en 3D estilizado](/proyectos/0a2604ce-96e7-4809-835e-b99de5d99fbf) y
[Mika en anime](/proyectos/8a6e31e0-20e5-417e-b8a3-73e190045571). Cada uno conserva idea, escena,
fotograma, clip e historial.
