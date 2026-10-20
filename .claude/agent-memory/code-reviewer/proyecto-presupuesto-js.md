---
name: proyecto-presupuesto-js
description: Desde 0.45.0 `bun run build` falla por presupuesto de JS; cómo contrastarlo con el HTML servido sin leer .next (el hook lo bloquea)
metadata:
  type: project
---

Desde la 0.45.0, `bun run build` ejecuta `scripts/presupuesto-js.ts` y falla si una ruta supera su tope de
`apps/web/presupuesto-js.json`. Una ruta nueva sin tope propio tiene 200 KB, y la base con sesión ronda los 153-182 KB.

**Why:** el hook del propietario bloquea cualquier comando que contenga `.next`, así que no se puede leer el build a
mano. En la revisión de la 0.45.0, el script sobreestimaba ~1,4 % frente al HTML real, no «al decimal».

**How to apply:** para contrastarlo, `next start --port 3096` y `curl` del HTML. Suma el gzip de los `<script src>`,
quitando el de polyfills (lleva `noModule`, en camelCase: un `grep nomodule` no lo excluye). Para comparar con el
«antes», crea un worktree temporal de la base con `node_modules` enlazados y el script copiado, y lanza
`bun scripts/presupuesto-js.ts` sin argumentos. Relacionado: [[proyecto-tests-integracion]].
