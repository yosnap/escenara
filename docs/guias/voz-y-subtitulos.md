# Voz y subtítulos de tu proyecto

Cuando tu proyecto ya tiene escenas con diálogo, esta pantalla decide **cómo suena** y **qué se lee**. Está en
**Proyectos → tu proyecto → Voz y subtítulos** (`/proyectos/<id>/voz`). Solo la ve el dueño del proyecto.

## Los dos modos de voz

Se elige **uno para todo el proyecto**, y son excluyentes:

| Modo | Quién pone la voz | Qué cuesta | Subtítulos |
|---|---|---|---|
| **Voz del clip** (de fábrica) | El propio modelo de vídeo, con los labios sincronizados | Nada más de lo que ya cuesta el clip | Se sacan transcribiendo el audio del clip |
| **Pista de voz aparte** | Un modelo de voz, escena a escena | Una llamada de voz por escena | Salen del diálogo y se ajustan con los tiempos del audio |

En modo «pista», los clips se piden **sin diálogo**, solo con sonido ambiente: si el clip también lo dijera, se
oirían dos voces distintas diciendo lo mismo.

## Por qué la voz no se elige escena a escena

Porque es lo único que hace que **el timbre no cambie de plano a plano**. Dos clips generados por separado pueden
salir con voces distintas aunque el personaje sea el mismo, y un vídeo así no se puede publicar. La voz y sus
mandos (estabilidad, fidelidad al timbre, estilo y velocidad) se fijan **una vez, para el proyecto entero**, y
todas sus escenas se generan con ellos.

Si lo intentas desde otra pantalla o con una herramienta propia, el servidor lo rechaza y te dice por qué.

## Oír una voz antes de elegirla

Cada voz tiene su **muestra**. La primera vez cuesta una llamada, y la pantalla te dice cuánto **antes** de
pedirla. A partir de ahí es tuya: volver a oírla no cuesta nada, ni hoy ni la próxima vez que abras el selector.
Si cambias un mando (por ejemplo, la estabilidad), esa combinación es otra muestra, porque suena distinto.

## Cambiar la voz: qué pasa con lo ya generado

Cambiar el modo, la voz, uno de sus mandos o **el diálogo de una escena** deja sin valer el audio y los subtítulos
que dependían de ello. Cuando eso ocurre:

- **no se borra nada**. El audio que pagaste sigue en tu biblioteca;
- **no se regenera nada solo**. Nunca se gasta sin que lo confirmes;
- si el cambio deja sin valer escenas ya generadas, la pantalla **te dice cuántas son** y te pide confirmarlo antes
  de aplicarlo;
- si pasas a «pista de voz aparte» y ya tienes clips producidos **con el diálogo hablado dentro**, también te lo
  dice: si les añades la pista sin volver a producir el clip, se oirían dos voces diciendo lo mismo;
- corregir los subtítulos de una escena **no la da por buena**: mientras lo que se oye siga sin corresponder a lo
  que dice ahora (su pista de voz o el audio de su clip), la pantalla te la sigue señalando;
- después, regeneras las que quieras **una a una**, confirmando el coste de cada una.

## Subtítulos

Hay tres formas de llenarlos, y todas dejan un punto de partida que **tú corriges**:

1. **Transcribir** el audio (la pista de voz, o el clip si estás en modo «voz del clip»). Los tiempos son los
   medidos. Transcribir **no cuesta nada**: se hace en la propia máquina y no sale nada de ella. Si tu instalación
   no tiene el transcriptor instalado, la pantalla lo dice: no se inventan subtítulos.
2. **Proponer desde el diálogo**, cuando aún no hay audio. Reparte el tiempo de la escena en proporción a lo que
   ocupa cada frase. Es una **propuesta**, no una medición: habrá que ajustarla.
3. **Escribirlos a mano**, añadiendo líneas con sus tiempos.

Transcribir y proponer **sustituyen los subtítulos por completo**. Si los que hay los has corregido tú, Escenara
te lo dice y te pide confirmarlo antes: lo que editas no se guarda en ningún otro sitio.

En el editor puedes cambiar el texto, los tiempos y **dónde se parte cada línea**. A la derecha ves el subtítulo
**sobre el clip**, con las zonas que la aplicación de destino tapa en vertical dibujadas: lo de arriba, su interfaz;
lo de abajo, sus botones y su pie de texto. Un subtítulo colocado ahí no lo va a leer nadie.

Escenara **avisa** cuando una línea es muy larga, cuando hay más de dos líneas o cuando un subtítulo pasa
demasiado rápido para leerlo, pero **no te lo impide**: tú sabrás. Lo que sí rechaza son los tiempos imposibles (un
subtítulo que acaba antes de empezar o que se solapa con el anterior), porque eso no se puede exportar.

## Descargar los subtítulos

Los botones **Descargar SRT** y **Descargar WebVTT** generan el fichero del proyecto entero, con los tiempos
corridos escena a escena en el orden en que se montará el vídeo.

Lo que se exporta son **los subtítulos que has guardado**, nunca la transcripción en bruto: lo que se publica es lo
que una persona ha corregido.

## Música de fondo

La música **se sube, no se genera**. Para añadir una pista tienes que **declarar por escrito con qué derecho la
usas**: de quién es, con qué licencia o dónde la compraste. Sin esa declaración no se añade, y lo impide el
servidor, no el formulario. Queda guardada con su fecha, para poder responder si alguien lo pregunta.

Cada pista tiene su **volumen**, que es con el que entrará en la mezcla final. Quitarla del proyecto **no borra el
archivo** de tu biblioteca.

## Si no puedes generar la voz

La pantalla siempre dice el motivo en lugar de esconder el botón. Los habituales:

- **«Esta instalación no ofrece la pista de voz aparte.»** Quien administra la enciende en Admin › Ajustes › Voz y
  subtítulos.
- **«No hay precio registrado.»** El modelo de voz está en el catálogo pero nadie ha medido su coste todavía. Sin
  precio no se estima y no se gasta: quien administra tiene que medirlo una vez y registrarlo en Admin › Modelos.
- **«Elige la voz del proyecto antes de generar.»** Estás en modo «pista» y aún no has fijado ninguna.
- **«Esta escena no tiene diálogo.»** No hay nada que leer: escribe lo que dice en el plan del proyecto.

Si la generación de la voz de una escena falla, la tarjeta de esa escena te lo dice. Es un fallo **de la voz**: su
clip sigue estando bien producido y la pantalla de producción no la marca como fallida.
