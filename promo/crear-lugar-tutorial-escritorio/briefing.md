# Briefing · Tutorial «Crear un lugar» (escritorio, para YouTube)

Tercer tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Desde la 0.52.8 la foto de un lugar real
se genera **dentro de su ficha**. La versión móvil (`../crear-lugar-tutorial/`) tiene el mismo guion y las mismas
acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz, rótulo breve y subtítulos. Generaciones reales en «Tutoriales», lugar inventado, tope de
  50 créditos entre las dos versiones. Se reutiliza en los tutoriales de clips: **Terraza Mirto**.
- La imagen se genera en «Lugares» y se enseñan el diálogo, el coste, el resultado y la declaración nueva (casilla
  «Puedo usar estas imágenes…», sin permiso del gestor). El cierre lleva escenara.com además de docs.escenara.com.

## Decisiones mías

- **Una sola foto**: la maestra es la única que se envía al generar. Es una imagen de `nano-banana-2-lite` por versión
  (unos 4 créditos). La foto generada entra como «Plano general» (`server/lugares/edicion.ts:151-159`), así que la
  grabación la marca como maestra con la ventana de opciones de «Qué muestra».
- **Terraza (exterior)**: el lugar ya era la terraza de una cafetería y el tipo de sitio ahora es solo informativo.
- **Uso «Comercial»**: la serie sigue con anuncios; hoy no cambia nada al generar.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`; opciones con `[role=option]:visible`.
- **Preparación**: `scripts/reiniciar-tutorial-recurso.ts --lugar "Terraza Mirto"`, que borra solo ese lugar.
  **Bloqueos**: `DELETE` de personajes, productos, lugares y medios, y `POST /api/lugares/*/edicion` no se bloquea
  porque es el encargo que enseña el tutorial.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| nuevo | `lista-lugares.tsx` («Crear el primero»), `apps/web/src/lib/lugares.ts` (`SUGERENCIA_FAMOSO`) |
| datos, acabado | `dialogo-nuevo-lugar.tsx` (nombre, descripción, «Acabado», no se puede cambiar después) |
| crear | `ficha-lugar.tsx:117` («Para poder usarlo: …») |
| generar, encargar | `ficha-lugar.tsx:225-240` («Generar una imagen»), `dialogo-foto-generada.tsx` (foto realista, vacía, desde la descripción guardada), `components/ui/imagen-generada/dialogo-imagen-generada.tsx` |
| resultado, maestra | `ficha-lugar.tsx:184` («Qué muestra»), `lib/lugares.ts` (`PAPELES_LUGAR`), `server/lugares/edicion.ts:151-159` |
| procedencia, sitio, uso | `declaracion-lugar.tsx` (origen preelegido «generadas» si todas las fotos son generadas, tipo de sitio, gente, uso) |
| declarar | `declaracion-lugar.tsx:50`, `:90` (`DECLARACION_PUEDO_USAR`), `:122` (menores) y `:141-156` («Declarar») |
| listo | `lista-lugares.tsx` (tarjeta «Listo para usar») |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`. Cada pasada genera una imagen (unos 4 créditos).
