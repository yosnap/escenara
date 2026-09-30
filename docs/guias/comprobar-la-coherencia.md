# Comprobar la coherencia

Desde la 0.24.0, Escenara puede comprobar que **lo generado encaja**: que una imagen sigue siendo la misma
persona, que la escena cuenta lo que dice el guion y que la voz suena como debería sonar.

Son **ocho comprobaciones**. Las cuatro primeras son las de esta guía (parecido, guion, resultado y emoción); las
otras cuatro miran la dirección del clip, el producto, el ángulo del anuncio y el reparto de un diálogo, y se
explican en sus guías. De fábrica solo la del parecido está en **«Activa»**: las otras siete van **«En sombra»**,
que quiere decir que miran y dejan escrito lo que opinan, para que puedas ver si aciertan antes de que nadie les
dé poder sobre tu trabajo.

### «En sombra» y «Activa»

Quien administra elige el modo de cada comprobación en **Admin › Ajustes › Coherencia**, con tres opciones:

- **Apagada**: no se mira nada y no se gasta nada.
- **En sombra**: la comprobación se hace, se guarda con su evidencia y **te enseña su veredicto, pero no bloquea
  nada**. Decides tú, siempre.
- **Activa**: su veredicto **decide de verdad**, pero hoy solo el del parecido tiene efecto: la vista generada que
  pasa cuenta como foto de referencia y la que no, no. **En sombra el parecido no cuenta**: se comprueba, se guarda
  y se enseña, pero la vista no cubre por él. En las otras siete, aunque se pusieran en Activa, la aplicación no
  bloquea ninguna exportación ni cambia el estado de la escena. En Admin › Ajustes › Coherencia, la opción Activa
  lo dice en cada comprobación: «Activa (decide la cobertura)» para el parecido y «Activa (todavía solo informa)»
  para el resto.

## Lo primero: no cambia nada sin que tú lo pidas

- Ninguna comprobación se lanza sola al generar, al abrir una pantalla ni al refrescar. La pides tú, con un botón.
- Ninguna gasta créditos. Mirar la imagen y escuchar la voz lo hace un servicio que se paga con **la cuota de tu
  plan**, así que se apunta con 0 créditos y lo que se guarda son los tokens.
- Si falta algo para comprobar, se te dice qué falta. No hay veredictos a medias ni huecos en silencio.

## 1. ¿Es la misma persona? (esta viene en «Activa»)

Cuando generas una vista que le falta a un personaje —la de frente, el perfil, el cuerpo entero—, hasta ahora esa
imagen **no contaba**: aparecía en su ficha con su distintivo de «generada» y la cobertura seguía diciendo que esa
vista faltaba. Con razón: una imagen generada puede no parecerse.

Ahora se puede comprobar. En la ficha del personaje, debajo de cada vista generada, tienes **«Comprobar el
parecido»**. Se describen por separado esa imagen y la cara de referencia del personaje, y se comparan los rasgos
que no cambian de una foto a otra: la forma de la cara, los ojos, la nariz, la boca, las orejas, el nacimiento del
pelo, los lunares. La pose, la luz, el peinado y el gesto **no cuentan**, porque cambian entre dos fotos de la
misma persona.

El veredicto puede ser:

| Veredicto | Qué significa | Qué pasa |
|---|---|---|
| **Es la misma persona** | Los rasgos coinciden y hay poca duda | Esa vista **cuenta** como foto de referencia y deja de faltar |
| **Mírala tú** | Hay parecido, pero no la confianza suficiente para decidir solo | No cuenta todavía; vuelve a comprobarla o sube una foto real |
| **No parece la misma persona** | Algún rasgo estable es claramente distinto | No cuenta, y no conviene usarla para guiar la generación |

Todo esto vale cuando el parecido está en **Activa**, que es como viene de fábrica. Si quien administra lo pone
**en sombra**, la ficha lo dice y ningún veredicto cuenta: el parecido se guarda y se enseña, pero una vista generada
no pasa a cubrir por él.

Debajo siempre sale **por qué**: la probabilidad y lo que se miró. Un veredicto que no puedes discutir no sirve de
nada. Con «Mírala tú» **no hay ningún botón para decidir a mano**: solo **«Volver a comprobar»**, y la vista no
cuenta hasta que otra comprobación dé «Es la misma persona» (o hasta que subas una foto real).

### Antes hay que autorizarlo (personas reales)

Para comparar dos caras hay que **enviarlas** a un servicio de percepción, que **no es** el mismo que genera tus
imágenes. El consentimiento que firmaste para producir vídeo no dice nada de eso, así que hace falta una
autorización aparte.

La encontrarás en el consentimiento del personaje, como casilla opcional: **«Autorizo la comprobación de
parecido»**. De ese servicio solo sale una descripción escrita de los rasgos, que es lo que se compara.

Si no la marcas no pasa nada malo: el personaje funciona exactamente igual que antes y sus vistas generadas
sencillamente no cuentan, como hasta la 0.23.x.

Un personaje **inventado** no necesita autorización: no hay ninguna persona real cuya cara salga de ahí, y sus
imágenes ya contaban desde la 0.23.2.

## 2, 3 y 4. Guion, resultado y emoción (vienen «En sombra»)

En la pantalla de revisión de un proyecto, cada escena tiene ahora **«Comprobar la coherencia»**. Sale de ahí:

- **La escena cubre el guion**: si lo que pediste ilustra lo que cuenta el guion, incluido su tono. Un guion triste
  ilustrado con una escena alegre se señala aquí.
- **El resultado encaja con lo descrito**: se mira el fotograma aprobado y se compara con lo que pediste.
- **La emoción encaja con el tono**: se escucha la voz del clip —lo que dice, cómo suena, el ambiente de fondo— y
  se compara con el tono del guion.

De fábrica las tres van **en sombra**, y eso quiere decir exactamente lo que parece: **no bloquean la exportación,
no cambian el estado de la escena y no aceptan ni rechazan nada**. Aparecen con su veredicto («Encaja», «Míralo tú»
o «No encaja»), su evidencia y su confianza, y ahí se quedan: decides tú. En la revisión de una escena, **ninguna**
fila decide nada, esté en sombra o en Activa, y el panel lo dice: «Aquí solo informa». El parecido solo decide en la
ficha del personaje. (En una escena de dos personajes se comprueba una vez por cara, y también solo informa.)

### Los dos botones que de verdad importan

Debajo de cada veredicto hay **«Tiene razón»** y **«Se equivoca»**. Son la parte más útil de toda esta versión:
sin ellos nadie puede saber si estas comprobaciones sirven o no.

Cada vez que pulsas uno, esa opinión se guarda. Quien administra la instalación ve en **Admin › Coherencia** el
acierto de cada comprobación, cuántas veces dejó pasar algo que tú rechazaste y cuántas veces frenó algo que
estaba bien. Con esos números se decide si alguna merece pasar de «mirar» a «decidir». Con menos de 20
correcciones no se enseña ningún porcentaje, porque un porcentaje sobre cuatro casos no significa nada.

## Sobre la «confianza»

Al lado de cada veredicto verás un porcentaje de confianza. Dice **cómo de concentrada** está la respuesta del
modelo: si ha contestado con seguridad o dudando entre varias opciones.

**No es una tasa de acierto.** Un 90 % de confianza no significa que acierte nueve de cada diez veces. Lo único
que dice cuántas veces acierta es el panel de acierto, y solo cuando tiene muestra suficiente.

Por eso existe el veredicto «míralo tú»: cuando la confianza no llega al umbral que ha puesto quien administra, el
sistema no decide y te lo pasa a ti.

## Qué necesitas para que funcione

1. Que quien administra haya guardado la **clave de TypeSafe** en Admin › Ajustes › Coherencia. Sin ella no se
   comprueba nada y la pantalla lo dice.
2. Que tengas en tu **mapa de modelos** un servicio compatible con la API de OpenAI que vea imágenes, y que oiga
   audio si quieres comprobar la emoción de la voz. Quien administra elige en Admin › Ajustes › Coherencia qué
   modelo se prueba primero (de fábrica, «gemma4» para imágenes y «mimo-v2.5» para audio) y ese modelo tiene que
   estar dado de alta en tu mapa; si no, se recorre tu mapa tal cual. Para el audio, hoy solo oyen «mimo-v2.5» y
   «mimo-v2.6-flash» de NaN builders. Se paga con la cuota de tu plan y no cuesta créditos.
3. Para el parecido de una persona real, su **autorización** en el consentimiento.

Si falta cualquiera de las tres, se te dice cuál y todo lo demás sigue funcionando igual.

## Si algo falla

Si el servicio de comprobación no contesta, **no se decide nada** y lo que había se queda como estaba. Nunca se le
quita la cobertura a una foto por una avería de red: se te cuenta lo que ha pasado y puedes volver a intentarlo.

## Ver también

- [Crear un personaje](crear-un-personaje.md) y [Buenas referencias](buenas-referencias.md)
- [Personajes inventados](personajes-inventados.md)
- [Revisar la continuidad](revisar-la-continuidad.md)
- [Mapa de modelos](mapa-de-modelos.md), que es de donde sale el servicio que mira y escucha
