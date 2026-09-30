# Accesibilidad

Escenara se construye para que cualquiera pueda crear con ella: con ratón, con el teclado, con un lector de pantalla,
con la letra grande o con «reducir movimiento» activado. El objetivo es **WCAG 2.2 nivel AA** en toda la aplicación.
Aquí está lo que la aplicación garantiza hoy (y cómo se comprueba), los atajos de teclado y cómo avisarnos si algo no
funciona.

## 1. Lo que la aplicación garantiza

| Garantía | Cómo se comprueba |
|---|---|
| **Contraste AA** en el tema claro y en el oscuro: 4,5:1 para el texto y 3:1 para bordes y foco | Tests de los tokens de marca y de la marca publicada. Una marca de la instalación con un texto que no se lee **no se publica** (ver [Personaliza tu instancia](personaliza-tu-instancia.md)) |
| **Foco visible** en todos los controles: un aro de 2 px del color de foco | Test sobre todo el código: ningún control quita el aro sin poner otro indicador |
| **Todo se puede hacer con el teclado**, también lo que se arrastra (ordenar, encuadrar, soltar archivos) | Tests de teclado de las piezas complejas (sección 2) |
| **«Saltar al contenido»** es lo primero que se enfoca en cada página | Test: todas las páginas tienen su contenido principal en `#contenido` |
| **Nombres accesibles**: cada botón, casilla, interruptor, selector y campo dice qué es, ya desde el HTML del servidor | axe sobre las pantallas principales (sin violaciones serias ni críticas) |
| **Encabezados en orden** y zonas de la página (cabecera, navegación, contenido) | axe |
| **Errores ligados a su campo**: el lector de pantalla los dice al llegar al campo (`aria-describedby`) y el campo se marca como no válido | axe y tests de los formularios y del editor de subtítulos |
| **Alertas** con su tipo escrito (no solo el color) y con «Ir al campo» para llegar a lo que falta | Tests de la alerta |
| **Objetivos táctiles** de al menos 24 px (44 px en los botones y controles principales) | Test sobre todo el código |
| **Tablas anchas** que se desplazan con el teclado (Tab para llegar y flechas para moverse) | Test: toda tabla va en una región desplazable |
| **«Reducir movimiento»** apaga el parallax, las animaciones de entrada, el confeti, los giros y los desplazamientos suaves; los vídeos del escaparate no arrancan solos | Test sobre todo el código: ninguna animación sin su guarda |
| **Nada se mueve sin fin**: la mascota se mueve unas veces y para; los vídeos tienen botón de pausa; el pase de imágenes se detiene al pasar el ratón o al enfocarlo | Tests de los componentes |
| **Idioma de la página** declarado (`es` o `en`, el de tu cuenta) | Test del layout |
| **Diálogos** con el foco dentro mientras están abiertos, cierre con Escape y vuelta del foco al botón que los abrió | Componente único de diálogo (Base UI) |

Las comprobaciones automáticas corren en la suite (`bun test`): axe revisa el HTML de la portada, el acceso, la
biblioteca, «Crear» y su historial, los proyectos, la producción, la revisión, el montaje, la cuenta y el catálogo de
componentes del admin. Lighthouse en móvil da 100 en accesibilidad en esas mismas pantallas.

## 2. Atajos de teclado

| Dónde | Tecla | Qué hace |
|---|---|---|
| En cualquier página | **Tab** / **Mayús + Tab** | Pasa al siguiente o al anterior control |
| | **Intro** o **Espacio** | Pulsa el botón o marca la casilla enfocada |
| | **Escape** | Cierra el diálogo o el desplegable abierto |
| Selectores y buscadores | **Flechas arriba y abajo**, **Intro** | Recorren las opciones y eligen una. En los buscadores, escribe para filtrar |
| Selector de tema | **Flechas** | Cambian entre sistema, claro y oscuro |
| Listas que se ordenan (escenas, fotos, recomendadas) | **Espacio** o **Intro** en el asa | Coge el elemento; las **flechas** lo mueven, **Espacio** o **Intro** lo sueltan y **Escape** lo deja donde estaba. Cada paso se anuncia |
| Encuadre del montaje | **Flechas** con el foco en el vídeo | Mueven el recorte cinco puntos en cada pulsación. También hay botones con los encuadres preparados y «Volver a automático» |
| Recorte de una escena en el montaje | **Flechas** en el deslizador, o escribe los segundos | Ajustan dónde empieza y dónde acaba |
| Flujos por pasos («Crear», el plan del proyecto) | **Tab** hasta la barra de pasos | Cada paso es un botón; «Anterior» y «Siguiente» llevan al contiguo. Un paso bloqueado dice por qué |
| Alertas con lo que falta | **Intro** en «Ir al campo» o «Ir al primero» | Lleva el foco al campo que falta, aunque esté en otro paso |
| Selector de medios | **Tab** hasta «Subir desde el equipo», «Elegir de la biblioteca» o «Desde una URL» | Hace lo mismo que arrastrar un archivo |
| Tablas anchas | **Tab** hasta la tabla y **flechas** | Desplazan la tabla en horizontal |

## 3. Lo que todavía no se ha comprobado

- **No hay certificación externa.** Las comprobaciones son automáticas y de código; una auditoría con personas que usan
  lector de pantalla a diario queda para más adelante.
- El recorrido completo con **VoiceOver o NVDA** no se ha grabado todavía en cada pantalla.
- La interfaz está en español; el inglés llega con las traducciones.

## 4. Cómo avisarnos de un problema

Si algo no se puede hacer con el teclado, un lector de pantalla no lo dice bien, un texto no se lee o algo se mueve
cuando has pedido que no, **abre un issue** en el repositorio de Escenara en GitHub (pestaña **Issues**; la guía de
contribución del repositorio explica cómo) con:

- la pantalla (la dirección de la página) y qué intentabas hacer;
- con qué lo usas: navegador, sistema, lector de pantalla o ajuste (zoom, «reducir movimiento», tema);
- qué esperabas y qué pasó.

Un fallo de accesibilidad se trata como cualquier otro fallo: se corrige en un parche.
