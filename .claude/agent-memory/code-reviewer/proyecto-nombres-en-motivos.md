---
name: proyecto-nombres-en-motivos
description: Los motivos de las reglas del motor en control_evaluations llevan nombres de personas reales y productos; comprobar cualquier promesa de «sin nombres»
metadata:
  type: project
---

Los `motivo` que guarda `control_evaluations.rules` salen del motor ya compuestos con `«${nombre}»` (personaje,
reparto, producto). En los datos reales de 2026-09-30 había motivos del tipo «Elisabeth» no se puede usar… por su
consentimiento. `scenes.invalidation_reason` también puede llevar el nombre del personaje. Esa tabla no tiene clave
ajena al personaje, así que el nombre sobrevive al borrado de la ficha.

**Why:** la 0.39.0 prometía un panel y una evidencia «sin nombres» y los enseñaba igual. Quitar `nombre` de los hechos
no basta, porque el nombre viaja dentro de los textos.

**How to apply:** ante cualquier registro o panel que prometa «sin datos personales», busca `«` en los campos de
texto guardados de una copia real (`jsonb_array_elements(rules)`) y no solo en los campos `nombre`. Relacionado:
[[proyecto-admin-ve-toda-la-biblioteca]].
