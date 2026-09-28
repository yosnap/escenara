# Escenas habladas

**Versión:** 0.22.0 · **Para:** quien usa Escenara

El modo **Omni** hace que tu personaje hable en todas las escenas **con la misma cara, la misma voz y los labios
sincronizados**. Es el tercer modo de voz de un proyecto, junto a «Voz del clip» y «Pista de voz aparte», y se
elige en **Voz y subtítulos**.

| Modo | Misma voz entre escenas | Labios sincronizados | Qué cuesta |
|---|---|---|---|
| Voz del clip | No garantizada | Sí | El clip |
| Pista de voz aparte | Sí | No (el audio se pega después) | El clip + una llamada de voz por escena |
| **Omni** | **Sí** | **Sí** | Solo el clip |

## Los dos motores

En tu **mapa de vídeo** («Tu cuenta») eliges con cuál se generan:

| Motor | Cómo pone la cara y la voz | Medido el 2026-09-28 |
|---|---|---|
| **Gemini Omni 1.1 Flash** (recomendado) | Se **registran** una vez en el proveedor y cada escena las cita | 63 créditos por 4 s a 720p, 38 s |
| **MiniMax H3** | Se mandan en cada clip: las fotos del personaje y una muestra de tu voz | 40 créditos por 5 s a 768P, 143 s |

Flash es la recomendación de la plataforma: genera la voz, el ambiente y la imagen en **una sola llamada**, sin
pista de voz aparte ni mezcla posterior. H3 sale más barato y es bastante más lento, y su voz es la de tu mapa de
voz, así que el timbre lo eliges tú entre las voces de siempre.

## Con Gemini Omni Flash

1. En **Voz y subtítulos**, elige el modo «Omni».
2. Elige una de las **treinta voces** (cada una dice su género y su tono), describe cómo tiene que sonar —el
   acento va ahí: sin pedirlo no sale el de España— y escribe una frase de ejemplo.
3. Pulsa **«Registrar esta voz»**. **No cuesta créditos.**
4. Ve a la ficha del personaje, pestaña **«Escenas habladas»**, y pulsa **«Registrar para escenas habladas»**.
   Tampoco cuesta créditos, pero **envía su retrato al proveedor**, así que hace falta su consentimiento vigente.
5. Produce el proyecto como siempre. En este modo **no hay fotograma que aprobar**: cada escena es un solo clip.

**Si cambias la ficha del personaje** hay que registrarlo otra vez: lo que se envió era la ficha anterior. La
pantalla lo dice y el botón «Registrar de nuevo» lo arregla, sin coste.

**Si cambias la voz**, las escenas que salieron con la anterior quedan invalidadas: se te dice cuántas antes de
confirmar, no se borra nada y **no se regenera nada solo**.

## Con MiniMax H3

No hay nada que registrar, pero sí dos cosas que tener:

1. la **voz del proyecto** elegida en «Voz y subtítulos», como en el modo de pista;
2. su **muestra ya pagada**: es el audio que se manda en cada clip para que suene con ese timbre. Se paga una vez
   al oírla desde el selector de voz y se reutiliza en todas las escenas.

Si falta cualquiera de las dos, la pantalla de producción lo dice y no deja producir.

## Lo que cuesta

Cada escena cuesta **un clip**, y su cifra está delante antes de confirmar. Solo está medida la duración de cada
motor (4 s en Flash, 5 s en H3); las demás se calculan en proporción y aparecen marcadas como **estimadas**.

Si los clips de tu proyecto duran otra cosa de la que ese motor genera, la pantalla te lo dice con la duración
exacta que hay que poner: no se produce un clip de una duración que no se ha medido.

## Preguntas que suelen salir

**¿Registrar cuesta algo?** No. Los dos registros de Gemini Omni son gratuitos, medido con dinero real. Lo que
cuesta es cada escena.

**¿Qué se envía al proveedor al registrar?** El mejor retrato del personaje (y su vista de cuerpo entero si la
tiene) y el texto de su ficha. KIE guarda esa imagen con un identificador y la reutiliza en cada escena que lo
cite, así que la cara queda alojada allí. El consentimiento lo dice con todas las letras.

**¿Y si el proveedor deja de reconocer al personaje?** Se vuelve a registrar **una sola vez**, sin coste, y se te
dice. Si vuelve a fallar, el mensaje explica qué pasó y qué hacer en lugar de reintentar en bucle.

**¿Puedo usar un personaje inventado?** Sí, con su retrato ya elegido: ver la guía de
[personajes inventados](personajes-inventados.md).
