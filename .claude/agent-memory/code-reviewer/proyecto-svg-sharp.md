---
name: proyecto-svg-sharp
description: Subidas SVG en Escenara: el validador por regex se salta con entidades XML y sharp/librsvg tarda minutos con <use> anidados; og:image relativa sale con localhost
metadata:
  type: project
---

En la 0.42.0 (marca y kit), `lib/marca-activos.ts › motivoSvgNoValido` valida el SVG con regex sobre el texto crudo.
Se lo salta `&#117;rl(https://…)` (el parser XML decodifica la entidad después), además de `image-set('https://…')`
y `xml:base`. Y como admitía `<use>` sin límite, un SVG de ~900 B con 10⁵ instancias tardó 43 s en `sharp().png()`.
Cualquier usuario puede hacerlo, porque el logotipo del kit se rasteriza en la propia petición.

**Why:** son fallos que los tests del implementador no cubrían; la CSP de la ruta que sirve el activo es la única barrera.

**How to apply:** en cualquier subida de SVG, prueba siempre entidades de carácter en los valores y el fan-out de
`<use>` con un temporizador real, y busca `.timeout()` en los pipelines de sharp. Para `og:image` u otra URL
relativa en metadatos, comprueba que haya `metadataBase`: fuera de Vercel, Next 16 pone `http://localhost:$PORT`.
Tras la corrección (sin SVG, rechazo por firma), comprobé que el `is_a` de svgload en libvips 8.18 es laxo: abre
«texto <svg», HTML y svgz. Un `RIFF····WEBP<svg` acaba en el cargador de WebP solo por la prioridad de libvips. Por eso
conviene pedir `sharp.block` de VipsForeignLoadSvg* (disponible en sharp ≥ 0.33) y una lista blanca de `meta.format`.
En `env -i /bin/bash` no existe `timeout`; usa el timeout del propio `test()` de bun. Ver [[proyecto-tests-integracion]].
