# Briefing · Tutorial «Crear un producto» (escritorio, para YouTube)

Segundo tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a crear un producto inventado
con fotos generadas dentro de Escenara. La versión móvil (`../crear-producto-tutorial/`) tiene el mismo guion y las
mismas acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales en la cuenta «Tutoriales», producto inventado y sin marcas reales, tope de 50 créditos de KIE
  entre las dos versiones.
- El producto se reutiliza en los tutoriales de clips con un nombre estable: **Botella Ondina**.

## Decisiones mías

- **«Productos» no genera fotos.** La ficha solo elige fotos de la biblioteca (`apps/web/src/app/productos/_componentes/ficha-producto.tsx:38-48`,
  «Añadir de la biblioteca», `:164`). Por eso las fotos se generan antes en «Crear», como fotograma sin personaje, y
  el tutorial enseña las dos partes.
- **Dos fotos**: el envase entero, solo desde el texto, y el detalle del tapón, partiendo de la primera foto como
  imagen de partida para que salga la misma botella. Son 2 imágenes de `nano-banana-2-lite` por versión (unos 8
  créditos).
- **Sin texto ni logotipos en la botella**: evita letras deformes y la duda de la casilla de marca, que se deja sin
  marcar con verdad. Por eso los papeles son «El envase entero» y «Detalle de la tapa o el mecanismo», no la frontal
  con la etiqueta.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`: la ventana y su barra llenan 1920×1080.
- **Preparación**: `scripts/reiniciar-tutorial-recurso.ts --producto "Botella Ondina"`. Borra solo el producto con
  ese nombre exacto, con el borrado de la app; no toca personajes (Brisa, Lupo) ni lugares. Las fotos de pasadas
  anteriores se quedan en la biblioteca.
- **Bloqueos durante la grabación**: `DELETE` de personajes, productos, lugares y medios.
- La biblioteca se ordena de más reciente a más antigua, así que la grabación elige las dos primeras imágenes del
  selector (las recién generadas). No debe haber otra subida en la cuenta mientras se graba.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| origen | `apps/web/src/app/crear/_componentes/paso-origen.tsx:44-58` («Crear un fotograma nuevo» / «Usar una imagen que ya tengo») |
| quien | `paso-sujeto.tsx:74-83` («Sin personaje»), `:115-129` («Crear solo desde texto…»), `:130-139` (modelo); precio de Nano Banana 2 Lite en la lista de modelos: «4 créditos por imagen · validado» |
| escena | `paso-escena.tsx:60-95` («Qué quieres ver», mínimo 10 caracteres) |
| coste | `paso-fotograma.tsx:82-104` (coste y confirmación), `panel-generar.tsx:138` («Tengo derecho a usar esta imagen») |
| resultado | `resultado-trabajo.tsx:24-26` («Fotograma listo», «Ya está guardado en tu biblioteca») |
| tapon-referencia | `paso-sujeto.tsx:93-114` (imagen de partida desde la biblioteca y casilla de revisión de terceros) |
| nuevo, datos | `apps/web/src/app/productos/_componentes/lista-productos.tsx:41`, `dialogo-nuevo-producto.tsx:61-100`, `apps/web/src/lib/productos.ts:84-85` (descripción en español, una o dos frases) |
| tipo | `lib/productos.ts:22-35` (físico o digital), `dialogo-nuevo-producto.tsx:113-119` (casilla de marca, solo para avisar) |
| crear | `lista-productos.tsx:27-30` (al crear se va a la ficha), `dialogo-nuevo-producto.tsx:21-23` (nace sin fotos) |
| anadir | `ficha-producto.tsx:160-166` y `:225-243` (selector de la biblioteca, varias a la vez) |
| papeles | `ficha-producto.tsx:181-191` («Para qué sirve»), `lib/productos.ts:41-74` (papeles y para qué se mira cada uno) |
| listo | `lista-productos.tsx:61-88` (tarjeta con tipo y número de fotos) |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`.
- Para repetir solo una grabación: `--solo <id> --sin-preparacion`. `producto` no gasta; `foto-envase` y
  `foto-tapon` gastan unos 4 créditos cada una.
