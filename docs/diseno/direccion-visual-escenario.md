# Dirección visual «Escenario»

**Estado:** aprobada por el propietario el 26-sep-2026 como marca 0.5.0 · **Base:** `docs/branding/ESCENARA_BRAND_GUIDE.md` (0.4) y `escenara.brand.json` (0.4.0) · **Se implementa en:** 0.4.0 (sistema de diseño) y 0.5.0 (portada)

## Intención

Escenara debe sentirse como una **comunidad de creadores viva**: colorida, alegre, con movimiento, animaciones y parallax, y con ese aire de app de influencers que invita a crear un personaje nada más entrar. Esa energía llega a **todos los apartados**. Al mismo tiempo, el PRD exige confianza: el usuario ve siempre qué falta, cuánto costará y qué va a pasar. Esta dirección combina ambas cosas con dos capas:

- **Capa Escenario (vibrante):** portada, onboarding, biblioteca de personajes, catálogo de plantillas, storyboard, celebraciones, comunidad y estados vacíos.
- **Zonas de claridad (serenas):** costes y presupuesto, consentimiento, credenciales, errores, bloqueos y textos legales. Son igual de bonitas, pero sin parallax, sin texto sobre degradado y con contraste AA garantizado.

## Paleta

El núcleo no cambia: **cobalto** (dirección) y **coral** (chispa creativa). Se añade una familia vibrante para ilustración, degradados, insignias y categorías. Se mantiene el descarte previo del verde y el lila como colores de marca (el verde de «Correcto» sigue siendo solo semántico).

| Token propuesto | Valor | Uso |
|---|---|---|
| `vibrant.cobalt` | `#3D6BFF` | Degradados y fondos decorativos |
| `vibrant.coral` | `#F0663D` | Chispa, celebraciones, llamadas a crear |
| `vibrant.tangerine` | `#FF8A3D` | Degradados cálidos, categorías |
| `vibrant.sun` | `#FFC83D` | Destellos, logros, retos |
| `vibrant.fuchsia` | `#E8458B` | Comunidad, remezclas, favoritos |
| `vibrant.cyan` | `#19B8D9` | Viajes, exterior, estados informativos decorativos |

**Degradados con nombre**

| Nombre | Recorrido | Dónde |
|---|---|---|
| Foco | cobalto → cian | Cabeceras de estudio, anillos de personajes listos |
| Chispa | coral → sol | Botón principal de crear, celebraciones |
| Escenario | cobalto → fucsia → coral → sol | Portada, onboarding, tarjetas destacadas |
| Atardecer | fucsia → mandarina | Comunidad y retos |

**Reglas de contraste**

- El texto de lectura usa siempre los tokens semánticos de la guía 0.4 (`text`, `textMuted`, `primary`…), nunca un color vibrante.
- Texto sobre degradado solo en tamaños grandes (≥ 24 px, o ≥ 18,7 px en negrita) y con velo oscuro o claro que asegure 3:1 como mínimo. Por ejemplo, blanco sobre fucsia `#E8458B` ronda 3,7:1: vale para títulos grandes, no para cuerpo.
- Los estados no se expresan solo con color: icono y texto siempre.
- Cada token vibrante tendrá variante para tema oscuro en 0.4.0, verificada con herramienta automática.

**Colores por especialidad** (chips y tarjetas de plantilla): turismo → cian; presentación personal → cobalto; producto → coral; gastronomía → mandarina; belleza → fucsia; deporte → cobalto eléctrico con sol; salud general → cian sobre superficie clara; educación → cobalto; experiencias → atardecer; mascotas → sol con coral.

## Movimiento

| Tipo | Duración | Uso |
|---|---|---|
| Microinteracción | 120–220 ms (guía 0.4) | Hover, pulsación, selección, apertura de panel |
| Transición de vista | 300–500 ms con muelle suave | Cambio de pantalla, expandir tarjeta a detalle |
| Parallax | Ligado al scroll | Portada, galería, onboarding, cabeceras de personaje |
| Celebración | 800–1.200 ms | Hitos reales: personaje aprobado, escena aceptada, vídeo exportado |
| Espera | Etapas cualitativas o progreso real | Generaciones: nunca un porcentaje inventado |

- **Parallax por capas:** tres a cinco planos (fondo degradado, formas geométricas del marco Enfoque, tarjetas 9:16, chispas flotantes). Preferir animaciones CSS ligadas al scroll (`animation-timeline: scroll()` / `view()`) y usar Motion como alternativa donde no haya soporte.
- Animar solo `transform` y `opacity`. Nada que provoque recálculo de maquetación.
- **`prefers-reduced-motion`:** sin parallax ni confeti; transiciones sustituidas por fundidos cortos. Opción equivalente en las preferencias del usuario.
- En las zonas de claridad solo hay microinteracciones.

## Reglas de componentes

- Todo componente reutilizable se crea primero en el catálogo **`/admin/componentes`**, con sus variantes y estados, y después se usa en las pantallas (ADR-0011).
- **Nunca se usa el `<select>` nativo del navegador.** Selección única, múltiple y con búsqueda se hacen con los componentes del catálogo; un test lo impide en todo el código.
- El **selector de medios (media picker)** es un componente del catálogo; su comportamiento lo definirá el propietario.
- **Nada de bordes ni sombras de color en un solo lateral** de tarjetas o bloques (el típico acento a la izquierda): da aspecto de interfaz generada por IA. Se usan bordes completos, fondos suaves o un icono en círculo; un test lo impide.

## Componentes con carácter de creador

- **Anillo de historia.** Avatar del personaje con anillo degradado; el estado (listo, faltan fotos, en revisión) se indica también con icono y texto.
- **Tarjetas 9:16.** Como reels: vista previa silenciosa al entrar en pantalla, título, especialidad y duración.
- **Chips de preset.** Botones grandes y redondeados, icono ilustrado y color de su especialidad; con 44 × 44 px como mínimo.
- **Pegatinas.** Etiquetas redondeadas para «Nuevo», «Remezcla», «Reto de la semana», «Idea».
- **Depósito de presupuesto.** Barra que se llena con lo autorizado y lo reservado, siempre con cifras, moneda y la palabra «estimación». Vive en una zona de claridad.
- **Visor Enfoque.** Las cuatro esquinas del logotipo como marco en la captura guiada y en la previsualización de escenas.
- **Chispa, la mascota.** La estrella de cuatro puntas con expresiones sencillas: saluda, señala la vista que falta, celebra. Se entrega como animación vectorial ligera (Lottie o Rive) con versión estática.
- **Confeti de chispas.** Partículas con la forma del logotipo en los colores vibrantes.

## Tipografía y voz

- Manrope se mantiene. En la capa Escenario se permiten títulos display en 700 con interletraje ligeramente negativo y palabras destacadas con degradado (solo en tamaño grande).
- **Voz ampliada:** «clara, cercana y festiva, sin prometer resultados». Celebramos lo que el usuario consigue («¡Tu personaje ya tiene escenario!») y en las zonas de claridad seguimos siendo precisos («Estimación: 0,42 € por escena; el importe final depende del proveedor»).

## Tecnología propuesta

| Necesidad | Propuesta | Nota |
|---|---|---|
| Estilos y tokens | Tailwind CSS v4 con variables CSS generadas desde `escenara.brand.json` | Un único origen de verdad para los tokens |
| Componentes accesibles | shadcn/ui sobre Radix, tematizados | Foco visible y navegación por teclado de serie |
| Animación | Motion (antes Framer Motion) y animaciones CSS ligadas al scroll | Respeta `prefers-reduced-motion` |
| Mascota | Lottie o Rive | Decidir en 0.4.0 según peso y licencia |
| Efecto 3D en portada (opcional) | Three.js | Solo si el presupuesto de rendimiento lo permite |

## Presupuesto de rendimiento

LCP < 2,5 s, INP < 200 ms y CLS < 0,1 en un móvil medio. Parallax y vídeos de vista previa se cargan de forma diferida; las tarjetas 9:16 muestran una imagen estática hasta entrar en pantalla. Con ahorro de datos activado, sin vídeos automáticos.

## Qué cambia en la marca si se aprueba

1. `escenara.brand.json` pasa a `brandVersion` 0.5.0 con los grupos `vibrant`, `gradients` y `motion.transitionMs`.
2. La guía de marca añade las secciones «Capa Escenario» y «Zonas de claridad» y amplía la voz.
3. Se generan los activos pendientes: PNG apilados e isotipo, SVG monocromo, favicon simplificado de 16 px, iconos PWA, imagen social y la mascota.
