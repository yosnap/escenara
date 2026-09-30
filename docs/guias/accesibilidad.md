# Accesibilidad

Escenara se construye para que cualquiera pueda crear con ella: con ratón, con el teclado, con un lector de pantalla,
con la letra grande o con «reducir movimiento» activado. El objetivo es **WCAG 2.2 nivel AA** en toda la aplicación.
Aquí está lo que hoy está **comprobado** (y cómo), lo que **no** se ha podido comprobar todavía, los atajos de teclado
y cómo avisarnos si algo no funciona.

## 1. Lo que la aplicación garantiza

| Garantía | Cómo se comprueba |
|---|---|
| **Contraste AA de los pares de color que usa la interfaz**, en claro y en oscuro: 4,5:1 para el texto y 3:1 para bordes y foco. Los pares son: texto y texto suave sobre fondo y superficies; el acento sobre fondo y superficies; el texto sobre el acento; el color creativo sobre las superficies; los estados (correcto, aviso, error) sobre superficie, superficie elevada y fondo; el contador del admin sobre el aviso; las etiquetas sobre su color al 12 %; el texto oscuro sobre la chispa. No se calcula cada combinación pintada de cada pantalla: se comprueban esos pares, y la interfaz está obligada a usarlos (un test lo vigila para el texto oscuro fijo) | Tests de los tokens de Escenara y la validación de la marca de la instalación: una marca con uno de esos textos ilegible **no se publica** (ver [Personaliza tu instancia](personaliza-tu-instancia.md)) |
| **Foco visible** en todos los controles: un aro de 2 px del color de foco | Test sobre todo el código: ningún control quita el aro sin poner otro indicador |
| **Todo se puede hacer con el teclado**, también lo que se arrastra (ordenar, encuadrar, soltar archivos) | Tests de teclado de las piezas complejas (sección 2) |
| **«Saltar al contenido»** es lo primero que se enfoca en cada página, y lleva el foco al contenido | Test: todas las páginas (también la de «no existe») tienen su contenido principal en un `main#contenido` que recibe el foco |
| **Nombres accesibles**: cada botón, casilla, interruptor, selector y campo dice qué es, ya desde el HTML del servidor | axe sobre las pantallas principales (sin violaciones serias ni críticas; ver qué revisa y qué no, abajo) |
| **Encabezados en orden** y zonas de la página (cabecera, navegación, contenido) | axe |
| **Errores ligados a su campo**: el lector de pantalla los dice al llegar al campo (`aria-describedby`) y el campo se marca como no válido | axe y tests de los formularios y del editor de subtítulos |
| **Alertas** con su tipo escrito (no solo el color) y con «Ir al campo» para llegar a lo que falta | Tests de la alerta |
| **Objetivos táctiles** de al menos 24 px (44 px en los botones y controles principales) | Test sobre todo el código |
| **Tablas anchas** que se desplazan con el teclado (Tab para llegar y flechas para moverse) | Test: toda tabla va en una región desplazable |
| **«Reducir movimiento»** apaga el parallax, las animaciones de entrada, el confeti, los giros y los desplazamientos suaves; los vídeos del escaparate no arrancan solos | Test sobre todo el código: ninguna animación sin su guarda |
| **Nada se mueve sin fin**: la mascota se mueve unas veces y para; los vídeos tienen botón de pausa; el pase de imágenes se detiene al pasar el ratón o al enfocarlo | Tests de los componentes |
| **Idioma de la página** declarado (`es` o `en`, el de tu cuenta) | Test del layout |
| **Diálogos** con el foco dentro mientras están abiertos, cierre con Escape y vuelta del foco al botón que los abrió | Lo hace el componente único de diálogo (Base UI); no se comprueba en la suite |

### Qué revisa axe en la suite, y qué no

`bun test` pasa axe por el HTML de la portada, el acceso (entrar y registro), la biblioteca, «Crear» y su historial,
la lista de proyectos, la producción, la revisión, el montaje, la cuenta y el catálogo de componentes del admin. Una
violación **seria o crítica** rompe la suite; las moderadas y menores no.

Lo que **no** ve, porque trabaja sobre el HTML del servidor en un documento sin navegador (happy-dom):

- **no hay CSS**: no calcula el contraste de lo pintado ni el tamaño real de los objetivos (eso lo cubren los tests de
  tokens y de clases);
- **no hay estados abiertos**: los diálogos, los desplegables, los pasos que no están a la vista y los mensajes que
  salen al interactuar no se revisan así;
- **no hay interacción**: el recorrido con el teclado se prueba en tests propios (sección 2), no con axe.

### Lighthouse

Lighthouse en móvil ha dado **100 en accesibilidad** en las siete pantallas en las que se ha pasado: la portada,
entrar, la biblioteca, «Crear» (sin clave de proveedor, con su aviso), la lista de proyectos, el historial de «Crear» y
la cuenta. No se ha pasado en la producción, la revisión, el montaje ni el admin.

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
- **Lector de pantalla real:** el recorrido con VoiceOver o NVDA no se ha hecho todavía en cada pantalla. Los nombres,
  los estados y los errores están en el marcado, pero no se ha escuchado cómo suenan.
- **Zoom y texto grande:** no se ha revisado pantalla a pantalla al 200 % ni al 400 %, ni con el tamaño de letra del
  sistema al máximo.
- **INP (lo que tarda en responder a un toque):** no se ha medido con interacción real; solo su indicador de laboratorio
  (el tiempo de bloqueo), que es bajo.
- **Contraste pintado:** axe no lo calcula en la suite (ver arriba); Lighthouse sí, en las siete pantallas medidas.
- La interfaz está en español; el inglés llega con las traducciones.

## 4. Cómo avisarnos de un problema

Si algo no se puede hacer con el teclado, un lector de pantalla no lo dice bien, un texto no se lee o algo se mueve
cuando has pedido que no, **abre un issue** en el repositorio de Escenara en GitHub (pestaña **Issues**; la guía de
contribución del repositorio explica cómo) con:

- la pantalla (la dirección de la página) y qué intentabas hacer;
- con qué lo usas: navegador, sistema, lector de pantalla o ajuste (zoom, «reducir movimiento», tema);
- qué esperabas y qué pasó.

Un fallo de accesibilidad se trata como cualquier otro fallo: se corrige en un parche.
