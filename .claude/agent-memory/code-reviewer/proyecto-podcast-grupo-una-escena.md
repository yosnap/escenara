---
name: proyecto-podcast-grupo-una-escena
description: podcast_group_id se genera con randomUUID por escena; un «grupo de podcast» es una sola escena que produce dos clips
metadata:
  type: project
---

`scenes.podcast_group_id` se asigna en `reparto/servicio.ts` con `escena.podcastGroupId ?? randomUUID()` al elegir el
formato podcast: cada escena tiene su propio grupo. Los «dos clips del mismo grupo» salen de **una** llamada a
`producirEscenaHablada` (clave derivada por turno), no de dos escenas.

**Why:** en la 0.37.0 se escribió `aplicarLugarAlGrupo` para sincronizar escenas hermanas que no existen, y la guía lo
describía como si hubiera varias escenas.

**How to apply:** ante «los dos clips del podcast comparten X», mira la llamada única y los reintentos parciales
(`yaEncoladas` con la misma clave), no la sincronización entre escenas. Relacionado: [[proyecto-dualcast-turno]].
