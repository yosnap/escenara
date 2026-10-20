---
name: proyecto-candados-encolar
description: encolar serializa con FOR UPDATE sobre users, no sobre projects; un borrado que bloquee otra fila no choca con un encolado concurrente
metadata:
  type: project
---

`cola/encolar.ts` bloquea `select 1 from users where id = … for update` y nada más. En la 0.47.0 el borrado de
proyecto bloqueaba `projects` y recontaba los trabajos activos creyendo que así chocaba con un encolado: no es así. El
trabajo insertado a la vez sobrevive porque `generation_jobs.scene_id` es `ON DELETE SET NULL`, sale al proveedor y se
cobra.

**Why:** cualquier «recomprobar dentro de la transacción» que no tome el mismo candado que `encolar` deja la ventana
abierta. Relacionado con [[proyecto-podcast-grupo-una-escena]].

Tras las correcciones de la 0.47.0, el borrado de proyecto toma `users` primero, y `encolar` comprueba la escena con
`for key share` y guarda `generation_jobs.project_id`. Siguen fuera del candado el borrado de personaje (con
`character_id` a nulo, el worker se salta la revalidación del consentimiento y sube `input.referencias`) y
`pedirBorradoCuenta`. Además, el worker no mira si la cuenta está en gracia: un `preparando` que se reintenta sale
igual.

**How to apply:** en borrados o cierres que tengan que excluir trabajos nuevos, exigir el candado de `users` (o que
`encolar` bloquee lo que se borra). También: durante la gracia del borrado de cuenta, `sesionDePeticion` devuelve
null en toda la API salvo `/api/cuenta/borrado`, así que cualquier cosa «para antes de irte» (descargas) queda
bloqueada si no se exime a propósito.
