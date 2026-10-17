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
  nuevo» → Brisa → escena con producto → coste → fotograma → clip. Desde la 0.52.11 el producto se elige en
  **«Describe la escena»** (`paso-escena.tsx`, `SelectorProducto`): sus fotos entran como referencia del fotograma,
  que ya sale con Brisa y la botella. En el clip sigue elegido y allí se comprueba la acción; pedido el fotograma, el
  selector de la escena queda bloqueado (`productoBloqueado`).
- **Botella Ondina contestada «No» a la marca** (fuera de cámara, en su ficha, antes de grabar): los productos de
  antes de la 0.52.11 quedaron «sin responder» y así se pedía la casilla de marca, que no corresponde a una botella
  sin texto ni logotipos.
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
- **Tras «Generar fotograma» se baja al paso 6 en cuanto aparece**: la página cambia de paso y se queda abajo, en
  blanco; esperar antes de desplazar dejaba esa imagen vacía en pantalla.
- **Esperas sin recargar**: el estado de «Crear» vive en la página y recargar lo perdería; el seguimiento del trabajo
  ya consulta solo (`almacen-trabajo.ts`). Hasta 10 min para el fotograma y 15 para el clip.
- **Sin preparación**: «Crear» no deja recursos con nombre que choquen al repetir. **Bloqueos**: `DELETE` de
  personajes, productos, lugares y medios.

- **El clip se reproduce al final, con su sonido** (petición del propietario): una segunda grabación, `resultado`,
  llega fuera de cámara al mismo resultado sin gastar créditos. Usa «Usar una imagen que ya tengo» con el
  fotograma real de esta versión, y el `POST` del clip se responde con el GET del trabajo real ya generado
  (`interceptar` de la captura). Lo que se ve es la app con ese trabajo.
  - Escritorio: trabajo `2325ff01-7e61-4869-8e95-dceed9556304`, medio `f9ff2193-…`.
  - Móvil: trabajo `0196c040-aba6-4e96-9a6f-21705968997f`, medio `17e5e120-…`.
  - La acción `reproducir` del motor toca el play y guarda el MP4 que sirve la app. En el render se reproduce entero
    encima del vídeo de la página, acercado, con la música bajada 24 dB y la frase de Brisa audible.
  - Repetir solo esto: `pnpm preparar --video <carpeta> --solo resultado` y después
    `pnpm video --video <carpeta> --sin-capturas`.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| formato | `app/crear/_componentes/paso-formato.tsx`, `lib/pasos-crear.ts` (`pasoPredeterminadoDeCrear`) |
| origen | `app/crear/_componentes/paso-origen.tsx` («Crear un fotograma nuevo»: se paga el fotograma y después el clip) |
| quien | `paso-sujeto.tsx:86` («Se enviarán varias fotos de…»), casilla de revisión (`AVISO_SIN_TERCEROS`) |
| escena | `paso-escena.tsx` («Qué quieres ver»: dónde está, qué hace y cómo se ve) |
| producto-escena | `paso-escena.tsx` («El producto que sale ya en el fotograma… En el clip sigue elegido»), `SelectorProducto` («Qué se hace con él») |
| coste | `paso-fotograma.tsx` (`PasoCosteFotograma`: contexto que se enviará, comprobaciones previas, coste estimado) |
| generar-fotograma | `panel-generar.tsx:147` («Tengo derecho a usar esta imagen»), `vista-crear.tsx` (`generarFotograma` pasa al resultado) |
| fotograma | `resultado-trabajo.tsx:24-27` («Fotograma listo», «Ya está guardado en tu biblioteca») |
| modelo-clip | `paso-clip.tsx` (`SelectorModelo` con el precio de cada modelo), `lib/foto-de-producto.ts` |
| producto | `components/ui/direccion/panel-direccion.tsx` (el mismo `SelectorProducto`, con el producto ya elegido) |
| direccion | `paso-clip.tsx` («Lo que dice»), `panel-direccion.tsx` (plano, «Escríbelo tú») |
| confirmar-clip | `panel-generar.tsx:147-156` (derecho de imagen; la de marca no sale con la marca contestada «No»), `BloqueConfirmacion` («Animar 5 s») |
| ver-clip, opciones-clip | `visor-medio.tsx` (vídeo con controles), `resultado-trabajo.tsx`, `paso-clip.tsx` («Otro clip con este fotograma»), `convertir-en-proyecto.tsx` |
| clip | `paso-clip.tsx` (`SeguimientoTrabajo`, «Cambiar y volver a generar», «Otro clip con este fotograma»), `resultado-trabajo.tsx` («Clip listo»), `convertir-en-proyecto.tsx` (sin volver a generar ni cobrar) |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>` (graba y renderiza) o
  `pnpm preparar --video <esta carpeta>` y después `pnpm video --video <esta carpeta> --sin-capturas`.
- Cada pasada genera un fotograma y un clip: unos 48 créditos de KIE.
