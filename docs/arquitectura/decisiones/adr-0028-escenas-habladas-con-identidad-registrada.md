# ADR-0028 · Las escenas habladas citan una identidad y una voz registradas en el proveedor

- **Estado:** propuesto (firme: el camino Gemini Omni con personaje y voz registrados, y Gemini Omni 1.1 Flash como recomendado; provisionales y pendientes de confirmar: el modo `omni` como tercer modo de voz, un registro por versión de ficha y el precio estimado de 6, 8 y 10 s)
- **Fecha:** 2026-09-28
- **Versión del proyecto:** 0.22.0

## Contexto

Desde la 0.21.0 un proyecto elige **dónde vive su voz** (ADR-0025): dentro del clip, con los labios sincronizados
pero con el timbre cambiando de plano a plano, o en una pista aparte, con el mismo timbre siempre pero sin
sincronía labial. Las dos opciones dejan fuera lo que más se pide: **la misma cara y la misma voz en todas las
escenas, con los labios cuadrados**.

Gemini Omni resuelve las tres cosas a la vez con una pieza que no existía en la aplicación: se **registra** en el
proveedor una voz (una de sus treinta predefinidas, con una descripción y una frase de ejemplo) y un **personaje**
(su retrato y su ficha, asociados a esa voz), y a partir de ahí cada escena se pide citando su identificador. Medido
con dinero real el 2026-09-28: dos escenas distintas con el mismo `character_ids` salieron con la **cara idéntica** y
el diálogo en español exacto, y los dos registros **no cuestan créditos**.

## Decisión

1. **Tercer modo de voz del proyecto: `omni`**, junto a `clip` (el de fábrica) y `pista`. En él, cada escena es **un
   solo trabajo**: no hay fotograma que aprobar, porque la identidad no viene de una imagen generada antes sino del
   personaje registrado.
2. **La voz se registra una vez por proyecto** y el personaje **una vez por versión de su ficha**. Cambiar la ficha
   crea versión nueva y obliga a registrar otra vez; cambiar la voz invalida las escenas que salieron con la
   anterior, con la misma regla de la 0.21.0: se dice qué se invalida, se confirma, y **no se regenera nada solo**.
   Como registrar es gratis, esta regla no le cuesta dinero a nadie.
3. **El modelo sale del catálogo, no del código.** El código declara para qué modelos sabe montar la entrada de una
   escena hablada y en qué orden los prefiere; cuál está utilizable y a qué precio lo decide el catálogo, que es de
   quien administra. La **recomendación de la plataforma es Gemini Omni 1.1 Flash** (decisión firme del propietario,
   2026-09-28): genera voz, ambiente e imagen en una sola llamada —sin pista TTS ni mezcla posterior— al mismo
   precio que Gemini Omni y un 35 % más rápido.
4. **Registrar es enviar una cara al proveedor**, así que exige consentimiento vigente y queda escrito con su
   cuenta, su fecha y sus **0 créditos**. El 0 se guarda como dato, no se promete en un comentario: es lo que
   permite auditar que este camino no cobra.
5. **Un identificador que el proveedor ya no reconoce se vuelve a registrar una sola vez**, sin coste, y el anterior
   se conserva marcado como reemplazado: explica con qué identidad salió lo que ya se generó. Una vez y no en
   bucle, porque reintentar contra un proveedor que rechaza convierte su avería en una tormenta nuestra.
6. **Dos motores, elegibles desde el mapa de vídeo del usuario** (decisión firme del propietario, 2026-09-28):
   Gemini Omni 1.1 Flash, que **es la recomendación de la plataforma**, y **MiniMax H3**
   (`minimax-h3/reference-to-video`), que no registra nada: la cara son las fotos del personaje
   (`reference_image_urls`) y la voz, una muestra ya pagada de la voz del proyecto (`reference_audio_urls`), así
   que su timbre es el del mapa de voz. Medido el 2026-09-28: 40 créditos por 5 s a 768P y 143 s, frente a los 63
   créditos por 4 s y 38 s de Flash. Más barato y bastante más lento, y con la voz en dos llamadas en lugar de
   una: por eso es alternativa y no recomendado.
7. **El diálogo no se traduce** (va en el prompt como `saying in Spanish: "…"`, la forma medida); la descripción de
   lo que se ve sí, como en todos los demás modelos.

## Consecuencias

- El modo `omni` **no genera fotogramas**, así que en él no hay paso de «aprobar el fotograma»: la escena se produce
  entera de una vez y su coste es el del clip. La rejilla de producción lo dice y no ofrece un botón que el
  servidor va a rechazar.
- El precio está **medido solo para la duración de cada motor** (4 s en Flash, 5 s en H3). Las demás se estiman
  proporcionales y se marcan como estimadas hasta medirlas.
- Con MiniMax H3 hacen falta **dos cosas que no son registros**: la voz del proyecto elegida y su muestra ya
  pagada. La muestra **no se paga al producir**: se paga una vez desde el selector de voz, donde el usuario ve su
  coste. Esconder ese gasto dentro de «producir una escena» sería cobrar algo que no se ha confirmado ahí.
- Una escena hablada se encola como el resto de los clips (`kind = "animacion"`), pero **sin trabajo padre**. Eso
  mantiene intactos la cola, el cierre del gasto y la conciliación: no hay un segundo camino de dinero.
- El worker envía **los identificadores que se guardaron al encolar**, no los que el personaje tenga registrados al
  llegar su turno: lo que se paga tiene que ser lo que el usuario confirmó.

## Alternativas descartadas

- **OmniHuman 1.5** (foto más audio): medido el mismo día, 135 créditos por 5,3 s y unos 4 minutos. Queda como
  alternativa futura para voz propia clonada o grabada.
- **Exponer `character_ids` como un parámetro más del modelo.** Es una identidad guardada en un proveedor, con
  consentimiento de por medio: tiene que tener su registro, su fecha y su puerta, no ser un campo del formulario.
- **Registrar una voz por personaje.** Volvería a cambiar el timbre entre proyectos del mismo personaje, que es
  justo lo que este modo viene a evitar.
