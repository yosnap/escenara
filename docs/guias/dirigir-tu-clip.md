# Dirigir tu clip

Hasta ahora escribías qué se veía y qué se decía, y la cámara la ponía el programa: siempre la misma, un plano
fijo con un temblor ligero. Desde la 0.25.0 diriges tú, parte por parte, como un director. No hace falta que
sepas inglés ni que veas ningún texto técnico: eliges con botones y el programa se encarga del resto.

## Las seis partes de un clip

Cada escena se dirige con seis decisiones. Ninguna es obligatoria salvo el formato: lo que no elijas se queda
en su valor sensato y se te dice cuál es.

### 1. El formato

- **UGC a cámara**: el personaje te habla mirando al objetivo. Lo que escribas en el guion es lo que se le
  oirá decir, palabra por palabra.
- **Voz en off / b-roll**: un clip **mudo**. El personaje sale con la boca cerrada y no habla. La narración se
  monta encima después.

Si eliges voz en off y tenías guion escrito, no se pierde: se te avisa de que no se envía al modelo y se
guarda para el montaje.

### 2. El plano y el ángulo

El **plano** dice cuánto se ve: del plano general (cuerpo entero y sitio) al primerísimo primer plano (solo la
cara). El **ángulo** dice desde dónde se mira: de frente, tres cuartos, de perfil, picado, contrapicado,
cenital, holandés, contraluz o gran angular.

Para hablar a cámara, el plano medio y el ángulo de tres cuartos son los que mejor funcionan.

### 3. La cámara

Qué hace la cámara durante el clip. Están ordenados por cuánto se puede confiar en que el modelo los respete:

- **Básicos** (salen casi siempre): quieta con gestos, plano fijo, zoom lento a la cara, zoom rápido al empezar
  a hablar, en mano sutil.
- **Con variación** (salen bien la mayoría de las veces): acercamiento sutil, retroceso que revela, órbita
  lenta, seguimiento al caminar.
- **Avanzados** (mira el clip antes de darlo por bueno): push-in a los ojos en la frase clave, contrapicado
  heroico, foco que cambia al fondo, cámara lenta.

**Solo un movimiento por clip.** Si eliges dos, se te avisa y se envía el primero: los modelos, cuando les
pides dos movimientos, parten el plano en dos. Si de verdad quieres los dos, parte la escena en dos y pon uno
en cada una.

No elegir movimiento **también es una elección**: significa que la cámara se queda quieta, y así se le pide.

### 4. La micro-acción y su momento

El gesto concreto del personaje: asiente, sonríe, se encoge de hombros, señala a cámara, se toca el pelo,
suspira… Y, sobre todo, **cuándo** lo hace:

- **antes de hablar**: el gesto va primero y luego la frase;
- **mientras habla**: acompaña a la frase;
- **después de hablar**: cierra el clip con él.

Esto cambia de verdad el resultado: el modelo ejecuta las cosas en el orden en que se le piden.

### 5. El guion

Lo que dice, palabra por palabra. **No se traduce nunca**: se envía tal cual lo escribes, porque es
exactamente lo que se va a oír. Puedes añadir una **dirección vocal** corta si quieres matizar cómo lo dice:
«en tono cercano», «con energía».

### 6. La voz y el acento

La **voz se fija en el personaje**, no en la escena, con cinco ejes: género, edad, gravedad, textura y
entrega. Es parte de quién es, igual que su cara, y así no cambia de timbre de un plano a otro.

> Cambiar la voz de un personaje crea una versión nueva suya e invalida su registro de voz en el proveedor.
> Se te dice antes de hacerlo.

El **acento se elige por proyecto** y se respeta en todas sus escenas: España (peninsular neutro),
rioplatense, bogotano, CDMX o latinoamericano neutro. De fábrica es el de España.

## Una sola toma, siempre

A todos los clips se les pide **una sola toma continua, sin cortes**, y que la cámara se quede quieta al
terminar el movimiento. No es una opción y no se puede desactivar: sin eso, los modelos cortan a media frase.

Antes de generar verás, en castellano, un resumen de lo que has pedido. No es el texto que se le manda al
modelo —ese es cosa del programa y solo lo ve quien administra—: es tu elección, escrita para que la
reconozcas.

## El fotograma: las seis C

El clip nace de un fotograma, y el fotograma se dirige con seis bloques que van siempre en el mismo orden:

| | Qué fija |
|---|---|
| **Personaje** | Quién es. Si es una persona real, sale de sus fotos de referencia |
| **Cámara** | Plano, ángulo y óptica |
| **Ropa** | El outfit, el estilismo y los accesorios |
| **Sitio** | Dónde está y qué se ve detrás |
| **Luz** | Qué luz hay, sus sombras y su grano |
| **Realismo** | Piel de verdad, anatomía correcta y nada escrito en la imagen |

El último bloque **no se puede quitar**: es lo que separa una foto creíble de un dibujo por ordenador. Lo
compone quien administra la instalación.

### Con una persona real no se la embellece

Si el personaje es una persona real, su identidad sale de sus referencias y se le pide expresamente al modelo
que **no la retoque, no la adelgace y no le cambie el atractivo**. Las descripciones de belleza solo existen
para personajes inventados, y solo si tú las eliges: nunca por defecto.

### El registro estético

Dos acabados, elegibles por escena:

- **Real y cercano (UGC)**: luz del sitio, cámara en mano, como un vídeo grabado sin pensarlo.
- **Cuidado (estilo influencer)**: luz trabajada y encuadre limpio.

Cambia la cámara, la luz y la textura. **No cambia quién es la persona.**

## Partir de una foto que te gusta

Sube una foto de referencia y el programa lee de ella la **cámara**, la **ropa**, el **sitio** y la **luz**, y
te los deja escritos en campos que puedes corregir. No lee quién es la persona: eso sale de las referencias de
tu personaje.

**No se genera nada hasta que confirmas esos campos.** Lo que un modelo cree ver no es necesariamente lo que
tú quieres pedir, y darlo por bueno sin mirarlo sería gastarte el dinero en la interpretación de otro. Si algo
no se ha podido leer, se te dice cuál y lo escribes tú.

## Cambiar solo una cosa

Partiendo de un fotograma que ya has aprobado, puedes cambiar **una sola cosa** y dejar todo lo demás
idéntico: la ropa, el sitio o la postura. Puedes añadir una segunda foto de referencia (la prenda, el fondo).

Es también la forma de hacer un **antes/después**: dos salidas de la misma imagen con un rasgo cambiado.

## ¿Ha salido lo que pediste?

Cuando el clip está hecho, puedes pedir que se compruebe si **hace lo que dirigiste**: si tiene el plano, el
movimiento, el gesto y el momento que elegiste, y si es una sola toma sin cortes. El veredicto viene con su
motivo y con dos botones —«tiene razón» y «se equivoca»— que son lo único con lo que se mide si acierta.

De momento esta comprobación **no bloquea nada**: se registra y se te enseña, para poder medir cuánto acierta
antes de darle poder. Quien administra puede apagarla en Admin › Ajustes › Coherencia.

## Lo que todavía no está

- La **prueba real** del orden del prompt, de que la regla de toma única evita el corte y de que el acento se
  oye está preparada pero **sin ejecutar**: gasta créditos y hace falta autorización.
- La **hoja de identidad 3×3** (nueve retratos en una imagen) se genera y se guarda, pero nace como
  **candidata** y no se usa por defecto: primero hay que comprobar con datos si da mejor parecido que las
  vistas sueltas.
