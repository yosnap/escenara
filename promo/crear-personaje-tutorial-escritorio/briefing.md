# Briefing · Tutorial «Crear un personaje» (escritorio, para YouTube)

Es el mismo tutorial que `../crear-personaje-tutorial/`, que es la referencia de estilo y tiene la evidencia de
cada frase en su `briefing.md`. Cambia el dispositivo: la app se graba en escritorio y la ventana del navegador,
fija, ocupa todo el encuadre 16:9.

## Decisiones del propietario (2026-10-17)

- Mismo estilo que la versión móvil: onda en cada toque, texto escribiéndose, ventana de opciones al elegir, foco
  con oscurecido y acercamiento suave, y esperas recortadas. Sin animaciones de anuncio ni ventanas que vuelan.
- **Sin voz**. El entregable es el MP4 sin voz:
  - En la versión sin subtítulos se lee el rótulo de cada paso, en la barra del navegador.
  - En la versión con subtítulos se leen además las frases completas del guion. Es la recomendada.
  - La duración de cada escena sale del tiempo de lectura de sus frases y de sus acciones, no de una locución
    (`"voz": { "proveedor": "ninguna" }`).
- Tope de 50 créditos de KIE. Las fotos de Lupo no se regeneran.

## Decisiones mías

- **Viewport** `{ "ancho": 1600, "alto": 856 }`: escalado a 1,2, la ventana y su barra de 52 px llenan
  exactamente 1920×1080.
- **Guion** idéntico al de la versión móvil, con el mismo rótulo por escena. Los selectores y los pasos de las
  grabaciones también sirven en escritorio sin cambios. El motor se desplaza solo hasta cada elemento antes de
  tocarlo.
- **Fotos de Lupo**: `mascota/fotos` es un enlace simbólico a `../crear-personaje-tutorial/mascota/fotos`, así
  que no se duplican ni se regeneran.
- **Preparación**: `reiniciar-tutorial-personaje.ts --nombre Brisa --mascota Lupo`. La grabación crea a Brisa y a
  Lupo de cero.

## Cómo repetir

- Desde el motor (`feat/modo-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`.
- Para repetir solo una grabación: `--solo <id> --sin-preparacion`. Repetir `inventado-retratos` o
  `inventado-vistas` vuelve a gastar: 12 y 16 créditos.
