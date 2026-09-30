# Personaliza tu instancia

Desde la 0.42.0, quien administra una instalación de Escenara puede cambiar su **marca**: el nombre, el lema, los
logotipos, la tipografía y los colores de los dos temas. Se hace en **Admin › Marca** (`/admin/marca`), se ve antes de
publicar en claro y en oscuro a la vez, y se publica de golpe.

Lo más importante, antes de nada:

- **Si no publicas nada, todo sigue exactamente igual**: la marca de Escenara, con su CSS, sus iconos y sus títulos.
- **Publicar es atómico**: o cambia todo o no cambia nada. Si algo falla a mitad, sigue la versión anterior, entera.
- **Un texto que no se lee no se publica.** El contraste se comprueba en los dos temas y un texto por debajo de 4,5:1
  sobre su fondo bloquea la publicación, diciendo qué par falla y con qué razón.
- **Cada versión publicada queda en el historial** y se vuelve a ella con un clic.
- Es la marca **de la instalación**. El logotipo que cada creador pone en sus vídeos es otra cosa: su
  [kit de marca](tu-kit-de-marca.md), en su cuenta.

## 1. Las secciones del editor

| Sección | Qué cambias | Dónde se ve |
|---|---|---|
| **Textos** | Nombre de la instalación, lema y descripción (en español y en inglés) | Título de cada pestaña («Tus personajes · Tu nombre»), la portada, el logotipo si no subes uno, y al compartir un enlace |
| **Colores** | Los 14 tokens de cada tema (fondo, superficies, texto, acento, estados…) y los 6 colores vibrantes | Toda la interfaz, en claro y en oscuro |
| **Tipografía** | La familia de la interfaz: la de Escenara (Manrope), la del sistema, una con serifa o una **fuente propia** | Toda la interfaz |
| **Logotipos** | Horizontal y símbolo, para el tema claro y para el oscuro | Las cabeceras, y de ellos salen el favicon, los iconos y la imagen social |

Arriba del todo está la **previsualización**: dos paneles, uno por tema, con componentes reales (botones, un campo,
alertas, una tarjeta, el degradado y el logotipo) pintados con la marca que estás editando. Mientras un campo está a
medio escribir, la previsualización se queda con la última marca válida.

## 2. Qué se admite y qué no

Todo lo que acaba en el CSS de la página se comprueba con listas cerradas, en el navegador y otra vez en el servidor:

- **Colores**: solo `#RRGGBB` (por ejemplo `#2753D7`). Ni nombres, ni `rgb()`, ni `var()`.
- **Familias**: nombres de letras, números, guiones y espacios, sin comillas ni signos. Ni URL ni nada que se pueda
  cerrar, ni palabras reservadas de CSS como `inherit` o `unset`.
- **Textos de marca**: sin saltos de línea, sin marcas invisibles de dirección (las que harían que el nombre se leyera
  al revés) y sin `<` ni `>`; los emojis, las banderas y escrituras como el persa se admiten. Nombre hasta 40
  caracteres, lema hasta 80, descripción hasta 120.
- **Medidas y tiempos**: enteros en su rango. El objetivo táctil mínimo no baja de 44 px y respetar «reducir
  movimiento» no se puede apagar.

Si algo no cumple, el campo se marca en rojo con su motivo y ni se guarda ni se publica. Por la API ocurre lo mismo: un
JSON inválido responde con la lista de campos que fallan y **la versión anterior sigue activa e intacta**.

Puedes partir del [`escenara.brand.json`](../branding/escenara.brand.json) de referencia: el documento de cada versión
tiene su mismo esquema. Sus bloques `logo` y `validation` describen ficheros del repositorio y umbrales fijos, así que
se aceptan y no se guardan.

## 3. El contraste

La comprobación es la misma que vigila la marca de Escenara en sus tests:

- **Bloquean** los pares de texto sobre fondo (4,5:1): texto y texto suave sobre fondo y superficies, el acento sobre
  fondo y superficies, el texto sobre el acento, el color creativo sobre las superficies y los de estado (correcto,
  aviso, error) sobre la superficie, la superficie elevada y el fondo.
- Desde la 0.45.0 bloquean también **los pares que pinta la interfaz real**, no solo los tokens básicos: el contador
  de trabajos en revisión del admin (`onPrimary` sobre `warning`), las etiquetas del historial de versiones (cada
  color de estado sobre su propio color al 12 %) y el **texto oscuro fijo sobre la chispa** (los extremos coral y sol
  del degradado y `brandSpark`), que es el de los números de paso, el preset elegido y el distintivo de «generada».
- **Avisan** los bordes y el foco (3:1) y los colores vibrantes en pegatinas y titulares. Se puede publicar, pero se
  verán peor.

La alerta dice cada par como «Tema oscuro: textMuted sobre background da 3,21:1 y necesita 4,5:1».

## 4. Logotipos

- **PNG, JPEG o WebP**, hasta 2 MB y entre 16 y 4096 px por lado. Para un logotipo, lo mejor es un **PNG con fondo
  transparente**.
- **Esta versión no admite SVG.** Un SVG no es una imagen sin más: es un documento que el ordenador interpreta, y uno
  preparado a propósito de menos de 1 KB puede tener el servidor ocupado durante minutos al convertirlo en píxeles.
  Hasta que Escenara pueda revisarlos con garantías, un SVG se rechaza al momento, sin llegar a procesarlo, con el
  mensaje «Convierte tu logotipo a PNG (con fondo transparente) o a WebP». Casi cualquier editor de imágenes o de
  diseño exporta un SVG a PNG; hazlo a buen tamaño (por ejemplo 1024 px de ancho) para que se vea nítido.
- Todo logotipo se **vuelve a codificar** al subirlo: se guardan sus píxeles, sin metadatos ni nada pegado al archivo.
  Si la foto venía girada por el móvil (orientación EXIF), se guarda ya derecha.
- El procesado de imágenes tiene **tiempo máximo** y, como mucho, **dos a la vez** en toda la instalación. Si en ese
  momento se están procesando otras, la subida dice «Espera unos segundos y vuelve a subirla».
- Todo se sirve desde esta instalación con su tipo real, `nosniff` y una política de contenido cerrada.

Si solo subes el logotipo del tema claro, se usa en los dos. Si no subes ninguno, se ve el símbolo de Escenara con el
nombre de tu instalación. El nombre accesible del logotipo (el que lee un lector de pantalla) es también el de tu
instalación.

**Al publicar se generan** a partir del símbolo claro (o del horizontal, si no hay símbolo): favicon de 16 y 32 px,
iconos de la aplicación de 192 y 512 px (con su manifiesto) e imagen para compartir de 1200 × 630. Sin logotipos no
se genera nada y siguen los iconos de Escenara.

El **icono de Apple** (`/apple-touch-icon.png`, que iPhone y iPad piden por su cuenta al guardar la página en la
pantalla de inicio) es el de 192 px de tu marca. Si tu marca tiene logotipo pero no se generó ese icono, no se sirve
ninguno (el sistema pone el suyo): nunca el de Escenara en una instalación con otra marca. Sin logotipos, el de
Escenara, igual que el resto de iconos.

La imagen para compartir necesita una dirección que se pueda abrir desde fuera: pon la **URL pública** de tu instalación
en **Admin › Ajustes** (por ejemplo `https://estudio.ejemplo.es`). Sin ella (o si solo es `localhost`), el enlace se
comparte con el nombre y la descripción, sin imagen.

## 5. Fuentes propias

En **Tipografía › Subir una fuente propia**:

1. Solo **WOFF2**, hasta 1 MB. Si tienes TTF u OTF, conviértela antes a WOFF2 (por ejemplo con `woff2_compress`); se
   rechaza diciendo eso mismo.
2. El nombre de la familia, con letras, números, guiones y espacios.
3. **La licencia**: OFL, Apache 2.0, fuente propia o licencia comercial con uso web, y quién tiene los derechos.
4. **La declaración** de que tienes derecho a usarla en la web de esta instalación. Queda apuntada con la fecha y tu
   cuenta, igual que la declaración de derechos de la música.

La fuente se sirve desde tu instalación: **nunca se descarga nada de terceros** al cargar una página. Comprueba bien
la licencia: muchas fuentes comerciales no permiten el uso web sin una licencia aparte.

## 6. Guardar, publicar y revertir

- **Guardar borrador** guarda lo que ves. Nadie más lo ve. Hay un solo borrador a la vez; «Descartar borrador» vuelve
  a la publicada.
- **Publicar** guarda el borrador y lo publica. En la misma operación se vuelve a validar todo, se comprueba el
  contraste, se retira la versión anterior y se generan los iconos. Si algo falla, no cambia nada.
- **Historial**: cada versión publicada con su fecha y sus notas. **Revertir a la versión N** la vuelve a publicar tal
  como era, con sus mismos archivos. Si esa versión **ya no cumple el contraste de hoy** (porque se publicó antes de que
  se comprobaran más pares), no se publica: vuelve como **borrador**, con cada par que falla en el aviso y en sus notas,
  para que corrijas esos colores y la publiques. Lo publicado no cambia mientras tanto. Si ya tenías un borrador sin
  publicar, no se pisa: publícalo o descártalo antes.
- **Volver a la marca de Escenara** retira la publicada (pide un segundo clic para confirmar). La versión queda en el
  historial.

La marca se aplica en el propio HTML de cada página, igual que el tema: el navegador la tiene antes de pintar, así que
no hay destello al entrar ni al cambiar de marca. Otras máquinas de la misma instalación la ven en su siguiente
página, sin esperar a nada.

## 7. Quién puede

Solo quien administra. La página y **cada operación** lo comprueban por separado: una cuenta normal recibe un 403
aunque llame a la API directamente.
