---
name: proyecto-consulta-vs-envio
description: la consulta de controles (panel previo) y el envío real recalculan los hechos por separado; revisar que les pasen las mismas entradas
metadata:
  type: project
---

`server/controles/consulta.ts` (panel de antes de pagar) y los envíos (`generacion/servicio.ts`, `omni/escena.ts`,
`produccion/controles-producto-clip.ts`, `asistente/plan.ts`) llaman a la misma función pura pero **cada uno calcula
sus argumentos**. En 0.35.1, la consulta contaba todas las fotos vigentes del personaje y el clip contaba 1 (el fotograma).
Con el reparto antiguo no se notaba; con el nuevo, el aviso daba cifras falsas y la elección estricta devolvía 400.

**Why:** que la función sea «una sola cuenta» no garantiza nada si las entradas son distintas.

**How to apply:** en cualquier cambio de reglas o avisos, compara los argumentos de cada llamada (el tipo de trabajo,
el personaje heredado de la imagen de partida, la hoja 3×3) y no solo la función compartida.

Repetido en 0.37.0 (lugares, revisión 2026-09-30): el envío excluía la maestra en `insertar_captura` y la consulta no.
Busca en el envío cualquier `x ? 0 : …` o excepción añadida en un commit de «fix» tardío y comprueba que la consulta
la tenga.

Hay **dos** pantallas previas, no una: la de «Crear» (`controles/consulta.ts`) y la de producción del proyecto
(`produccion/consulta.ts` → `hechosDeFila`), que evalúa cada escena con sus propios hechos. En 0.46.0 la segunda no
llevaba hechos de lugar: avisos confirmables (`lugar-sin-maestra`, `lugar-maestra-no-cabe`) sin casilla y 409 al
producir. Con cada regla nueva, comprueba que salga en las dos.
