# Medir el rendimiento

Guía corta para comprobar, en tu navegador, que Escenara va rápida en un móvil medio. Los objetivos del proyecto
(desde la 0.45.0) son:

| Medida | Qué es | Objetivo |
|---|---|---|
| **LCP** (Largest Contentful Paint) | Cuánto tarda en verse lo principal de la página | **< 2,5 s** |
| **INP** (Interaction to Next Paint) | Cuánto tarda en responder a un toque o una tecla | **< 200 ms** |
| **CLS** (Cumulative Layout Shift) | Cuánto «salta» la página mientras carga | **< 0,1** |
| **JavaScript por ruta** | Lo que descarga cada página al abrirla, comprimido | **200 KB** de meta; el build falla si una ruta pasa de su tope |

El último se comprueba solo: `bun run build` termina con una tabla de cada ruta, su tamaño y su tope, y **falla** si
alguna se pasa. Los topes están en `apps/web/presupuesto-js.json`; las rutas que hoy superan los 200 KB tienen un tope
propio con su tamaño medido y el motivo (es deuda: la meta sigue siendo 200 KB). Subir un tope es una decisión, no un
arreglo: antes, carga en diferido lo pesado o pasa componentes a servidor.

## 1. Prepara la medición

1. Compila y arranca la versión de producción, no la de desarrollo (que no está optimizada):
   `bun run build` y después `bun --filter @escenara/web start` (usa el puerto 3021: para antes `bun run dev` si lo
   tienes abierto, y vuelve a él al terminar).
2. Abre **Comet** en una ventana de incógnito (sin extensiones que interfieran) y entra en tu instalación.

## 2. Lighthouse en Comet (LCP, CLS y la puntuación)

1. Abre la página que quieras medir (la portada, «Tu biblioteca», «Crear»…).
2. Abre las herramientas de desarrollo: **Cmd + Opción + I** (macOS) o **Ctrl + Mayús + I**.
3. Pestaña **Lighthouse** → **Mode: Navigation**, **Device: Mobile**, marca **Performance** y **Accessibility**.
4. En el engranaje de la pestaña, **Throttling method: DevTools throttling (advanced)**. El método por defecto
   («simulated») estima el tiempo con un modelo que cuenta la descarga del JavaScript antes de pintar, y en esta
   aplicación da un LCP alrededor de 1 s peor que el real (ver el informe de la 0.45.0).
5. **Analyze page load**. Repite **tres veces** y quédate con la del medio: Lighthouse varía entre pasadas.

Anota LCP, CLS, Total Blocking Time (TBT) y la puntuación de accesibilidad.

Si tu versión de Comet no trae la pestaña **Lighthouse**, la pestaña **Performance** (sección 3) enseña también el LCP
y el CLS en sus **Live metrics** al recargar la página.

## 3. INP (hace falta interactuar)

Lighthouse no mide el INP: necesita que alguien toque la página.

1. Herramientas de desarrollo → pestaña **Performance**.
2. En el engranaje: **CPU: 4× slowdown** y **Network: Slow 4G** (un móvil medio).
3. Mira el panel **Live metrics**: usa la página como siempre (abre un selector, marca una casilla, cambia de paso en
   «Crear»). El **INP** se actualiza con cada interacción; por debajo de 200 ms está bien.

Como referencia rápida sin interactuar, el **TBT** de Lighthouse por debajo de 200 ms suele ir con un INP bueno.

## 4. Qué hacer si algo no llega

- **LCP alto:** mira en Lighthouse el elemento LCP y sus fases. Si el retraso es de carga, busca imágenes o vídeos que
  se descargan al abrir sin estar a la vista (deben ir con `loading="lazy"`).
- **INP o TBT altos:** busca componentes grandes que se hidratan al abrir y se podrían cargar al usarlos
  (`next/dynamic`), como ya se hace con el editor de imagen y el diálogo de la biblioteca.
- **CLS:** una imagen o un vídeo sin tamaño reservado. Las tarjetas usan `aspect-*` para reservarlo.

Resultados de referencia de la 0.45.0 (medidos en local): en el informe de la versión, con las cifras por ruta.
