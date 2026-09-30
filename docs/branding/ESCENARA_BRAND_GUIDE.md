# Escenara guía de identidad visual

**Versión 0.5 · 26 septiembre 2026 · dirección Enfoque, paleta cobalto coral y capa vibrante «Escenario»**

Escenara convierte un personaje en escenas y las escenas en historias. Su marca debe transmitir dirección creativa, continuidad y control: una herramienta profesional accesible para quien crea contenido con imágenes, vídeo y voz. Esta guía define el aspecto de la propia aplicación. Los vídeos que produzca cada usuario pueden utilizar una marca diferente.

## Nombre y lenguaje

**Nombre comercial:** Escenara. **Pronunciación:** es-ce-na-ra. **Escritura:** inicial mayúscula en texto y minúsculas `escenara` en identificadores. No traducir el nombre. **Descriptor:** «Estudio abierto de personajes y vídeo». **Eslogan principal:** «Da vida a cada escena». **Línea de producto:** «Crea personajes, dirige historias». Usar el eslogan en portada y presentaciones; en el producto preferir verbos concretos como «Crear personaje», «Preparar escena», «Revisar» y «Exportar». En inglés: «Bring every scene to life» y «Create characters, direct stories»; revisar con hablantes nativos antes de una campaña.

**Voz:** clara, cercana y festiva, sin prometer resultados (ampliada en 0.5: antes «clara, cinematográfica y precisa»). La interfaz informa lo que falta, lo que costará y lo que ocurrirá a continuación. No promete resultados perfectos ni presenta una puntuación de confianza como garantía. Ejemplo: «Falta una foto lateral para mantener mejor el perfil del personaje»; botón «Añadir foto lateral». Para costes: «Estimación: 0,42 € por escena; el importe final depende del proveedor». Evitar «La IA se encargará de todo».

## Símbolo y logotipos

**Dirección elegida: Enfoque.** Cuatro esquinas abiertas encuadran una chispa de cuatro puntas. El encuadre representa dirección y composición; el centro representa la escena creada. Se prepararon variantes horizontales, apiladas, isotipos y una versión monocroma. La primera propuesta con forma de E queda descartada. El comparativo anterior se conserva como historial, sin uso en producto.

| Variante | Composición | Uso |
|---|---|---|
| Principal horizontal | Símbolo + palabra Escenara | Cabecera web, documentación, presentación. |
| Compacta | Símbolo sobre palabra | Portadas cuadradas, cartel, pantalla de bienvenida. |
| Isotipo | Solo símbolo | Favicon, app, avatar social, estado de carga. |
| Monocroma | Todo en blanco o todo en tinta oscura | Fotografía, impresión de una tinta y espacios pequeños. |

Usar `escenara-horizontal-light.svg` sobre fondos claros y `escenara-horizontal-dark.svg` sobre fondos oscuros. Análogamente, `escenara-stacked-*` y `escenara-mark-*`. Los SVG tienen fondos transparentes y colores explícitos, de modo que el tema de la página decide qué archivo mostrar. Reservar espacio libre de al menos media altura del símbolo alrededor. Ancho mínimo sugerido: 140 px para el logotipo completo, 24 px para isotipo; a 16 px probar una versión simplificada antes de adoptarla como favicon. En fondos fotográficos colocar primero una superficie legible. No estirar, rotar, añadir sombras permanentes ni recolorear con colores ajenos a la paleta. Los archivos SVG mantienen el texto editable; para aplicaciones externas sin Manrope, exportar el texto a contornos o incrustar la fuente autorizada. Los archivos claros y oscuros se entregan por separado para evitar que el logotipo cambie según la configuración del dispositivo cuando el fondo real sea otro.

## Paleta

El **azul cobalto** representa dirección y claridad; el **coral cálido** marca la chispa creativa. Se descartan el verde y el lila del concepto anterior. Las superficies se mantienen neutras para que las fotos y escenas sean protagonistas. Los colores siguientes son **tokens de interfaz**, definidos de forma editable en `escenara.brand.json`. No aplicar un mismo color hexadecimal a todos los usos de ambos temas: cambia la luminosidad para mantener contraste.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| Fondo | `#F7F8FC` | `#0D1018` | Área de trabajo. |
| Superficie | `#FFFFFF` | `#171B27` | Paneles, formularios. |
| Superficie elevada | `#EFF1F8` | `#222839` | Menús y estados activos. |
| Texto principal | `#182032` | `#F5F6FA` | Títulos y cuerpo. |
| Texto secundario | `#485269` | `#B8C0D1` | Ayuda y metadatos. |
| Borde | `#858EA1` | `#737F98` | Campos, divisores y límites de componentes. |
| Acento | `#2753D7` | `#8EB8FF` | Enlaces y controles destacados. |
| Sobre acento | `#FFFFFF` | `#101320` | Texto dentro de botones de acento. |
| Chispa del logo | `#F0663D` | `#FFAD78` | Símbolo y detalles puramente gráficos. |
| Creativo | `#B53D1C` | `#FFAD78` | Etiquetas de «Idea» y detalles editoriales legibles. |
| Correcto | `#166A51` | `#66D6AB` | Preparado, completado. |
| Advertencia | `#875016` | `#F5C97A` | Revisar antes de gastar. |
| Error | `#A43343` | `#FF9EAD` | Falta obligatoria o fallo. |

No expresar estados solo mediante color: acompañar con texto e icono. El foco de teclado usa anillo de 2 px con separación de 2 px y debe ser visible en ambos temas. Comprobar al implementar contraste de al menos 4,5:1 en texto normal, 3:1 en texto grande y 3:1 en componentes e indicadores relevantes; verificar también los estados hover y disabled. Los colores de marca dentro del vídeo exportado no se fuerzan sobre la identidad del creador.

## Capa «Escenario» y zonas de claridad (0.5)

La aplicación es colorida, animada y con parallax en todos sus apartados, con aire de comunidad de creadores. Se añade una paleta **vibrante** (cobalto `#3D6BFF`, coral `#F0663D`, mandarina `#FF8A3D`, sol `#FFC83D`, fucsia `#E8458B`, cian `#19B8D9`, con variantes para tema oscuro) y cuatro degradados con nombre: **Foco** (cobalto → cian), **Chispa** (coral → sol), **Escenario** (cobalto → fucsia → coral → sol) y **Atardecer** (fucsia → mandarina). Los vibrantes son decorativos: el texto de lectura usa siempre los tokens semánticos.

**Zonas de claridad:** costes, consentimiento, credenciales, errores y avisos legales usan superficies neutras, sin parallax ni texto sobre degradado, con contraste AA. Detalle completo en `docs/diseno/direccion-visual-escenario.md`; tokens en `escenara.brand.json`.

## Tipografía y composición

**Principal:** Manrope variable para títulos, navegación, botones y cuerpo, con fallback `Inter, ui-sans-serif, system-ui, sans-serif`. **Datos técnicos:** `ui-monospace, SFMono-Regular, Menlo, monospace` para IDs, tiempos y costes comparables. Incluir archivos de fuente autoalojados y sus licencias en la distribución; evitar depender de peticiones a Google Fonts en instalaciones privadas. Pesos 400, 500, 600 y 700. Escala sugerida: display 48/56, H1 36/44, H2 28/36, H3 22/30, cuerpo 16/25, compacto 14/21, etiqueta 12/18 px. En móvil display 36/44, H1 30/38 y H2 24/32. Nunca reducir información crítica de coste o permisos por debajo de 14 px.

Diseño por rejilla de 8 px; márgenes 20 px en móvil y 32 px en escritorio. Radio 12 px para controles y 16 px para tarjetas; sombras muy suaves en claro, bordes definidos en oscuro. Controles mínimo 44 × 44 px cuando sean táctiles. Una vista debe priorizar el personaje, el storyboard o la previsualización, y dejar las decisiones y costes a la vista antes del botón de generar.

## Iconos, imágenes y movimiento

Iconos lineales de 1,75 a 2 px, extremos redondeados y significado acompañado por etiqueta cuando la acción no sea obvia. Las imágenes promocionales mostrarán personas y animales con consentimiento, diversas apariencias y ejemplos reales del producto. Evitar caras genéricas generadas como prueba de fiabilidad. Mantener el mismo personaje entre escenas en los ejemplos de marketing. Las miniaturas del storyboard usan relación 9:16 por defecto y permiten 16:9 y 1:1.

Microinteracciones de 120–220 ms para hover, selección y apertura de panel; transiciones de tema de hasta 180 ms. Respetar `prefers-reduced-motion`. Estados de generación muestran avance real cuando el proveedor lo ofrece o etapas cualitativas cuando no hay progreso fiable; nunca animar un porcentaje inventado.

## Uso en la aplicación y personalización

**Tema de interfaz:** `system` por defecto, con opciones claro y oscuro, persistidas por usuario. Durante la carga aplicar el tema antes de pintar la página para evitar destellos. Ofrecer vista previa simultánea de ambos modos en el panel de marca. Cambiar de tema modifica tokens semánticos; los componentes no llevan colores hexadecimales incrustados.

**Configuración de la marca de la instalación (0.42.0):** `escenara.brand.json` es la **referencia**: la marca de Escenara que se usa mientras nadie publique otra, el origen de `tokens.css` y el esquema del documento de marca. Quien administra una instalación edita su propia marca en **Admin › Marca** (nombre, lema, descripción, logotipos, tipografía con fuentes propias autoalojadas y colores de ambos temas), validada con ese mismo esquema y con listas estrictas para todo lo que acaba en CSS. Se previsualiza en claro y en oscuro a la vez, se comprueba el contraste AA (un texto por debajo de 4,5:1 bloquea la publicación) y se publica de forma atómica, con borrador, historial y revertir en un clic; un documento inválido conserva la versión anterior. Por eso **los tokens de una instalación pueden diferir de este JSON**: la versión publicada vive en la base de datos de la instalación, no en el repositorio, y el JSON sigue siendo la fuente de la marca de Escenara. Los ajustes son del despliegue; un usuario corriente no modifica la identidad global. Guía: `docs/guias/personaliza-tu-instancia.md`.

**Kit de marca del creador (0.42.0):** cada usuario tiene su kit en **Tu cuenta › Tu kit de marca**, separado de la marca de la instalación y solo para sus exportaciones: nombre, logotipo y esquina. El logotipo se superpone al vídeo al montarlo y **nunca tapa ni quita la etiqueta de contenido generado con IA** (si la esquina cae en su franja, pasa a la contraria, y la etiqueta se dibuja encima de todo). Colores, tipografía, voz editorial, producto y CTA del creador en subtítulos y plantillas quedan para una versión posterior; el kit no sustituye el tema de la interfaz. Una marca blanca de la aplicación es una decisión separada sobre licencia y permisos. Guía: `docs/guias/tu-kit-de-marca.md`.

## Entregables gráficos pendientes

La dirección Enfoque tiene variantes vectoriales para ambos temas, versión monocroma (`escenara-horizontal-mono.svg`), presentación conjunta (`escenara-identidad-enfoque.png`), exportaciones PNG, el icono (`escenara-icon.svg`, rejilla de 64, del que salen los iconos grandes) y su versión simplificada para 16 px (`escenara-icon-16.svg`, alineada a la rejilla de 16 y con la chispa mayor; con PNG de 16 y 32 px), que es el favicon de la aplicación. Desde la 0.45.0, `bun run activos` genera en `apps/web/public/` el `favicon.ico`, los iconos PWA (192, 512 y 512 enmascarable) y el icono de Apple (180, en `marca-escenara/`); con `bun scripts/activos-marca.ts --con-texto` (en `apps/web`, necesita Chrome) pinta además la imagen social (1200 × 630) y vuelve a pintar los PNG del wordmark con Manrope cargada (antes se rasterizaron con una fuente de sustitución). El manifiesto (`manifest.webmanifest`) se escribe a mano. En la aplicación el nombre del wordmark es texto de la página, no del dibujo: si Manrope no ha cargado, se ve con la fuente de respaldo sin recortarse. Sigue pendiente la portada del repositorio. Verificar disponibilidad de marca, dominio y cuentas antes de registrar una identidad o publicar assets definitivos.

## Fuentes de referencia

- Manrope: https://fonts.google.com/specimen/Manrope
- WCAG 2.2, contraste: https://www.w3.org/TR/WCAG22/
