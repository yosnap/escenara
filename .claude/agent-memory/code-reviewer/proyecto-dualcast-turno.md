---
name: proyecto-dualcast-turno
description: Los clips dualcast con identidad registrada llevan castClipOrder = 1, así que filtrar por castClipOrder IS NULL también los excluye, no solo al podcast
metadata:
  type: project
---

Un dualcast con identidad registrada se encola con `castClipOrder = 1` (el único clip del reparto), igual que el
primer turno de un podcast. Por eso `isNull(generationJobs.castClipOrder)` no significa «no es podcast»: deja
fuera también el dualcast. Un dualcast sin identidad envía un solo clip, el del protagonista, con `castClipOrder` a null.

**Why:** en la 0.41.0 la biblioteca de versiones y el aviso de cuota usaban ese filtro creyendo que solo quitaba el
podcast, y la rama dualcast de la puerta de versiones quedó sin usarse en el caso que importaba.

**How to apply:** si un cambio filtra por `castClipOrder`, comprueba qué pasa con `castFormat = 'dualcast'`. Filtrar
por el `castFormat` de la escena suele ser lo que se quería.
