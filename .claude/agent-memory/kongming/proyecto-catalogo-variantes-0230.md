---
name: proyecto-catalogo-variantes-0230
description: Consulta 2026-09-28 sobre 0.23.0 (catálogo dinámico KIE): la decisión final fue variantes en model_prices (una fila de models por id de API, unidad elegida viaja hasta el despacho)
metadata:
  type: project
---

Para 0.23.0 «Catálogo dinámico con precios públicos» primero recomendé una fila de `models` por variante con clave
de catálogo; el team-lead propuso algo mejor y lo validé: **una fila de `models` por identificador de API y las
variantes (1K/2K/4K, turbo/quality, segundos) como filas de `model_prices`**, que ya es única por
(provider, model, unit) y cuyo sello ya lleva la unidad. La unidad elegida viaja estimación → confirmación →
`generation_jobs.unit` → despacho, y la variante lleva sus parámetros estructurados (no se deduce del texto de la unidad).

**Why:** el sello `${proveedor}:${modelo}:${unidad}@v${version}` ya distingue variantes sin tocar `exigirSelloVigente`;
cambiar la clave de `models` rompía el mapa y `esModeloOmni`. Los precios públicos de KIE coinciden con lo medido.

**How to apply:** en consultas futuras sobre catálogo/sello, comprobar primero si `generation_jobs.unit` y los
parámetros de variante en `model_prices` llegaron a implementarse. El agujero de dinero a vigilar: el despacho
(`cola/despacho.ts`) re-resuelve el modelo por `fila.model` y monta la entrada con `parametros.resoluciones[0]`;
si no aplica la variante del trabajo, envía la resolución por defecto con la reserva de otra.
`versionDeSello` (`presupuesto/reserva.ts`) parte por «@v»: nada de «@v» en unidades.
