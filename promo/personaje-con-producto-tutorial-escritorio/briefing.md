# Briefing · Tutorial «Personaje con producto» (un anuncio, escritorio, para YouTube)

Cuarto tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a hacer un clip de anuncio en
**«Crear»** con un personaje y un producto que ya existen: Brisa y la Botella Ondina. La versión móvil
(`../personaje-con-producto-tutorial/`) tiene el mismo guion y las mismas acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales con KIE en la cuenta «Tutoriales», tope de 300 créditos entre las dos versiones. Se reutilizan
  **Brisa** (inventada, con vistas) y **Botella Ondina** (`57f555f1-b47c-4867-909d-4f042dbd6492`).
- Se enseñan la elección de personaje y producto, la escena, el coste antes de confirmar y el resultado real. El
  cierre lleva escenara.com además de docs.escenara.com.

## Decisiones mías

- **Camino de «Crear»**: formato «Clip para redes» (los trends tienen su propio tutorial) → «Crear un fotograma
  nuevo» → Brisa → escena → coste → fotograma → clip. En «Crear» el producto se elige **en el paso del clip**, con la
  dirección: el panel de dirección solo aparece cuando ya hay imagen de partida (`paso-clip.tsx:201`) y el servidor
  lo dice así (`server/generacion/servicio.ts:286-291`). Por eso la escena del fotograma no nombra la botella y deja
  las manos a la altura del pecho.
- **Modelo del clip: MiniMax H3 (referencia a vídeo)**, 40 créditos por 5 s a 768P (más 2 de traducción como
  máximo). Es el más barato de KIE que **admite la foto del producto** (`server/productos/modelos-sugeridos.ts:35`,
  cupo de galería ≥ 2); los demás de KIE o la describen solo con palabras (Hailuo 2.3 Standard, 30) o cuestan más
  (Veo 3.1 Fast 60, Gemini Omni 63). El fotograma, con `nano-banana-2-lite` (4 créditos más 2 de traducción como
  máximo). Unos 48 créditos por pasada.
- **Sin reutilizar el clip en móvil**: la clave de idempotencia es aleatoria en cada confirmación
  (`panel-generar.tsx:122`), así que enseñar el mismo clip en móvil obligaría a interceptar el envío y la
  confirmación grabada sería falsa. Con ~48 créditos por versión cabe de sobra en el tope, y cada pasada prueba la app.
- **Acción «Sostenerlo»** y no «Enseñarlo a cámara»: esta describe girarlo «con la etiqueta de frente» y la botella
  no tiene texto ni logotipos. Las instrucciones adicionales piden que la levante hacia la cámara.
- **Frase del clip**: «Mi Botella Ondina va conmigo a todas partes.» (H3 tiene voz y el acento es el de España por
  defecto). El tutorial no tiene audio, pero el clip queda completo para quien lo vea en la biblioteca.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`. Las opciones de los desplegables se leen con `[role=option]:visible`
  y las tarjetas de los electores visuales con `fieldset:has(> legend:has-text('…')) label`.
- **Espera del clip con la barra de pasos a la vista**: si la espera termina con el vídeo en pantalla, la primera
  imagen lo coge en negro (aún sin cargar). Por eso se sube a «Pasos para crear» antes de esperar y se baja al vídeo
  después.
- **Esperas sin recargar**: el estado de «Crear» vive en la página y recargar lo perdería; el seguimiento del trabajo
  ya consulta solo (`almacen-trabajo.ts`). Hasta 10 min para el fotograma y 15 para el clip.
- **Sin preparación**: «Crear» no deja recursos con nombre que choquen al repetir. **Bloqueos**: `DELETE` de
  personajes, productos, lugares y medios.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| formato | `app/crear/_componentes/paso-formato.tsx`, `lib/pasos-crear.ts` (`pasoPredeterminadoDeCrear`) |
| origen | `app/crear/_componentes/paso-origen.tsx` («Crear un fotograma nuevo»: se paga el fotograma y después el clip) |
| quien | `paso-sujeto.tsx:86` («Se enviarán varias fotos de…»), casilla de revisión (`AVISO_SIN_TERCEROS`) |
| escena | `paso-escena.tsx` («Qué quieres ver»: dónde está, qué hace y cómo se ve), `servicio.ts:286-291` (el producto va en el clip) |
| coste | `paso-fotograma.tsx` (`PasoCosteFotograma`: contexto que se enviará, comprobaciones previas, coste estimado) |
| generar-fotograma | `panel-generar.tsx:147` («Tengo derecho a usar esta imagen»), `vista-crear.tsx` (`generarFotograma` pasa al resultado) |
| fotograma | `resultado-trabajo.tsx:24-27` («Fotograma listo», «Ya está guardado en tu biblioteca») |
| modelo-clip | `paso-clip.tsx` (`SelectorModelo` con el precio de cada modelo), `lib/foto-de-producto.ts` |
| producto | `components/ui/direccion/panel-direccion.tsx:404` (`SelectorProducto`, «Qué se hace con él») |
| direccion | `paso-clip.tsx` («Lo que dice»), `panel-direccion.tsx` (plano, «Escríbelo tú») |
| confirmar-clip | `panel-generar.tsx:147-156` (derecho de imagen y de marca con producto), `BloqueConfirmacion` («Animar 5 s») |
| clip | `paso-clip.tsx` (`SeguimientoTrabajo`, «Cambiar y volver a generar», «Otro clip con este fotograma»), `resultado-trabajo.tsx` («Clip listo»), `convertir-en-proyecto.tsx` (sin volver a generar ni cobrar) |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>` (graba y renderiza) o
  `pnpm preparar --video <esta carpeta>` y después `pnpm video --video <esta carpeta> --sin-capturas`.
- Cada pasada genera un fotograma y un clip: unos 48 créditos de KIE.
