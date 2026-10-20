---
name: numeracion-fases-hoja-de-ruta
description: Cómo numerar fases nuevas en la hoja de ruta de Escenara (phase-NN es orden, la versión real se asigna al entregar; la 1.0.0 siempre al final)
metadata:
  type: project
---

En `plans/260926-1407-escenara-roadmap-v1/` el NN de `phase-NN-vX.Y.Z-slug.md` es número de ORDEN, no de versión; las fases pendientes del bloque G (44, 46, 47, 48) reciben su versión real al entregarse. Al insertar versiones nuevas no se desplazan versiones: se añaden con el siguiente NN libre y el fichero de la 1.0.0 se renombra con `git mv` (en el repo privado `escenara-planes`) para que siga el último (2026-09-30: 45→49; 2026-10-16: 49→51 al insertar 0.54.0 y 0.55.0).

**Why:** el propietario inserta versiones a mitad de camino a menudo; `plan.md` no lista 0.50–0.53 en tablas.
**How to apply:** comprobar con `ls` el último NN y la fase de la 1.0.0; actualizar `plan.md` de forma mínima (bloque nuevo, nota en «Dependencias principales», enlaces en «Fases detalladas»).

2026-10-18: plan `plans/261018-1140-idea-a-video-sin-modelos/` propone 0.54.0–0.60.0 (modelos ocultos, vídeo completo, guiado, detallado, plantillas) por delante; batería pasa a 0.61.0 y personaje desde una imagen a 0.62.0 (renombrado previsto al cerrar la 0.54.0, aún no aplicado). La 0.53.0 (tutoriales) queda parada con su número.
