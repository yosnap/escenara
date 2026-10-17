# Briefing · Tutorial «Crear un lugar» (escritorio, para YouTube)

Tercer tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a crear un lugar inventado con
una foto generada dentro de Escenara, marcarla como maestra y declarar sus derechos. La versión móvil
(`../crear-lugar-tutorial/`) tiene el mismo guion y las mismas acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales en la cuenta «Tutoriales», lugar inventado y sin marcas reales, tope de 50 créditos de KIE
  entre las dos versiones.
- El lugar se reutiliza en los tutoriales de clips con un nombre estable: **Terraza Mirto**.

## Decisiones mías

- **Un lugar real no se genera en «Lugares».** La ficha solo genera un «candidato» si el lugar es animado
  (`apps/web/src/app/lugares/_componentes/ficha-lugar.tsx:214-223`) y, en uno real, solo ofrece «Retirar personas»
  sobre una foto subida (`:184-195`). Brisa es realista y el acabado no se puede cambiar después
  (`dialogo-nuevo-lugar.tsx:14-17`), así que la foto se genera en «Crear», como fotograma sin personaje, y después se
  añade desde la biblioteca.
- **Una sola foto**: la maestra es la única que se envía al generar (`ficha-lugar.tsx:154-158`). Es una imagen de
  `nano-banana-2-lite` por versión (unos 4 créditos).
- **Terraza (exterior)**: la declaración exige el permiso de quien gestiona el sitio en cualquier interior, también
  en uno inventado con fotos «generadas aquí» (`declaracion-lugar.tsx:44` y `apps/web/src/server/lugares/declaracion.ts:61-62`).
  Para declarar con verdad, el lugar es la terraza de una cafetería en una plaza.
- **Uso «Comercial»**: la serie sigue con anuncios. Hoy no cambia nada al generar; queda en la declaración.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`.
- **Preparación**: `scripts/reiniciar-tutorial-recurso.ts --lugar "Terraza Mirto"`. Borra solo el lugar con ese
  nombre exacto, con el borrado de la app; no toca personajes (Brisa, Lupo) ni productos.
- **Bloqueos durante la grabación**: `DELETE` de personajes, productos, lugares y medios, y la edición de pago de la
  foto del lugar (`POST /api/lugares/*/edicion`).
- La grabación elige la primera imagen del selector de la biblioteca (la más reciente, la recién generada).

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| origen, quien, escena, coste, resultado | Las mismas que en `../crear-producto-tutorial-escritorio/briefing.md` (fotograma sin personaje en «Crear») |
| nuevo | `lista-lugares.tsx:47` («Crear el primero»), `apps/web/src/lib/lugares.ts:93-94` (sitio famoso: basta con nombrarlo) |
| datos | `dialogo-nuevo-lugar.tsx:64-90` (nombre y descripción: materiales, colores, muebles, la luz) |
| acabado | `dialogo-nuevo-lugar.tsx:91-104` (real o animado) y `:14-17` (no se puede cambiar después) |
| crear | `ficha-lugar.tsx:106` y `lib/lugares.ts:165-170` («Para poder usarlo: Marca una foto como maestra. Declara los derechos…») |
| anadir | `ficha-lugar.tsx:148-152` y `:262-279` (selector de la biblioteca; la primera sin maestra lo es) |
| maestra | `ficha-lugar.tsx:153-158` y `lib/lugares.ts:14-25` (maestra, plano general, contraplano, detalle, una zona) |
| procedencia | `declaracion-lugar.tsx:62-76` y `lib/lugares.ts:37-46` («Las he generado aquí»), «Sin declaración vigente no se genera con este lugar» |
| sitio | `declaracion-lugar.tsx:77-98` y `lib/lugares.ts:57-74`, `:86-87` (con gente reconocible no se puede generar) |
| uso | `declaracion-lugar.tsx:99-108` (personal / comercial) |
| declarar | `declaracion-lugar.tsx:116-153` (casilla de menores y «Declarar»), `lib/lugares.ts:91-92` (se guarda con su fecha) |
| listo | `lista-lugares.tsx:70-93` (tarjeta del lugar) |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`.
- Para repetir solo una grabación: `--solo <id> --sin-preparacion`. `lugar` no gasta; `foto-lugar` gasta unos 4
  créditos.
