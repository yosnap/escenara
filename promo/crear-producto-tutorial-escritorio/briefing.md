# Briefing · Tutorial «Crear un producto» (escritorio, para YouTube)

Segundo tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Desde la 0.52.9, al crear el producto
se llega al paso «Su primera imagen» y sus imágenes se generan **dentro de su ficha**. La versión móvil (`../crear-producto-tutorial/`) tiene el mismo guion y
las mismas acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales en la cuenta «Tutoriales», producto inventado y sin marcas, tope de 50 créditos de KIE entre
  las dos versiones. El producto se reutiliza en los tutoriales de clips: **Botella Ondina**.
- Las imágenes se generan en «Productos» y se enseñan el diálogo de generación, la elección de vista, el coste, el
  resultado y el diálogo de papeles. El cierre lleva siempre escenara.com además de docs.escenara.com.

## Decisiones mías

- **Dos vistas generadas**: «El envase entero» desde el paso «Su primera imagen» («Genera su primera imagen») y,
  cuando ya está en la ficha, «Detalle de la tapa o el mecanismo» con «Generar una imagen» (2 imágenes de
  `nano-banana-2-lite` por versión, unos 8 créditos).
- **Diálogo de papeles con una foto propia**: `producto/botella-ondina-sola.jpg` (en la carpeta móvil) es una foto
  de la misma botella generada antes en «Crear». Está subida una sola vez a la biblioteca de Tutoriales con ese
  nombre; la grabación la busca por «botella» y la añade como «El producto solo». No cuesta nada.
- **Sin texto ni logotipos en la botella**: la casilla de marca se deja sin marcar con verdad.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`. Las opciones de los desplegables se leen con `[role=option]:visible`:
  base-ui deja en el DOM, ocultas, las opciones de un desplegable ya cerrado.
- **Preparación**: `scripts/reiniciar-tutorial-recurso.ts --producto "Botella Ondina"` borra solo ese producto con el
  borrado de la app; no toca personajes ni lugares. **Bloqueos**: `DELETE` de personajes, productos, lugares y medios.
- El resultado entra al terminar el trabajo y se ve al recargar: la espera recarga cada 15 s.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| nuevo, datos | `apps/web/src/app/productos/_componentes/lista-productos.tsx`, `dialogo-nuevo-producto.tsx`, `apps/web/src/lib/productos.ts` (`AYUDA_DESCRIPCION_PRODUCTO`) |
| tipo | `lib/productos.ts` (`TIPOS_PRODUCTO`), casilla de marca en `dialogo-nuevo-producto.tsx` («Solo para avisarte…») |
| crear | `lista-productos.tsx` y `components/ui/imagen-generada/primera-imagen.tsx` (paso «Su primera imagen»: generar, subir o «Lo haré después») |
| generar, encargar | `ficha-producto.tsx:200-218` («Generar una imagen», desde la descripción guardada), `dialogo-vista-generada.tsx` («Qué vista generar», `PAPELES_GENERABLES`), `components/ui/imagen-generada/dialogo-imagen-generada.tsx` («Ver lo que cuesta», «Encargar») |
| resultado | `ficha-producto.tsx:245` («Generada aquí con IA»), `server/productos/generacion.ts:132` (entra con el papel pedido) |
| anadir, papel | `ficha-producto.tsx:282` y `dialogo-papeles-fotos.tsx` («¿Qué muestra esta foto?», «Añadir la foto») |
| listo | `lista-productos.tsx` (tarjeta con tipo y número de fotos) |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`. Cada pasada genera dos imágenes (unos 8 créditos).
