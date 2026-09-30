# ADR-0039 · Presupuestos de rendimiento y de JavaScript por ruta

- **Estado:** Aceptado para 0.45.0 (cifras recomendadas; revisables por el propietario)
- **Fecha:** 2026-09-30
- **Versión del proyecto:** 0.45.0

## Contexto

Escenara ha crecido pantalla a pantalla (dirección del clip, reparto, montaje, marca editable) y nadie medía cuánto
JavaScript descargaba cada una. Next 16 con webpack ya no imprime el «First Load JS» al compilar. Al medirlo por
primera vez, 22 de las 35 rutas pasaban de 200 KB comprimidos y la librería de animación (41 KB) se cargaba en casi
todas por un cargador que solo giraba un icono.

El PRD pide que la aplicación vaya bien en un **móvil medio**, y las métricas de campo que lo resumen son LCP, INP y
CLS.

## Opciones

1. **Un tope global rígido** (200 KB en todas las rutas). Obliga a rehacer ya las pantallas más ricas (Crear, el
   proyecto, el catálogo del admin) o bloquea el build desde hoy. Falla primero: en cuanto se añade una función.
2. **Medir y anotar sin fallar.** Nada frena una regresión: el número crece sin que nadie lo vea hasta que la app va
   lenta.
3. **Presupuesto por ruta comprobado en el build**, con una meta común y topes propios medidos para las rutas que hoy
   la superan, cada uno con su motivo. Falla primero si el tope propio se sube sin pensar.

## Decisión

Opción 3.

- **Objetivos en móvil medio:** LCP < 2,5 s, INP < 200 ms y CLS < 0,1. Se miden con Lighthouse en perfil móvil sobre el
  build de producción, tres pasadas y la mediana (`docs/procesos/medir-el-rendimiento.md`).
- **Meta de JavaScript por ruta:** 200 KB comprimidos en la primera carga. `bun run build` la calcula con
  `apps/web/scripts/presupuesto-js.ts` a partir de los manifiestos de Next (lo común a todas las páginas más los trozos
  de los componentes de cliente que el servidor de la ruta usa de verdad) y **falla** si una ruta supera su tope.
- **Toda ruta está dada de alta** en `apps/web/presupuesto-js.json`: en `dentroDeLaMeta` si cabe, o con tope propio.
  Una pantalla nueva sin alta hace fallar el build con las instrucciones, para que su peso se mire al crearla.
- **Topes propios** para las rutas que hoy superan la meta: su tamaño medido **más 3 KB** (margen fijo y pequeño: una
  regresión mayor rompe el build), con el motivo acabado en «Medido: X KB.». Son **deuda**: la tabla del build lo dice
  en cada ruta, y avisa si «Medido» ya no es la medida real. La meta no se cambia desde el JSON (el script lo rechaza).
- **Salida de emergencia:** `PRESUPUESTO_JS_SOLO_AVISO=1` en el entorno del build convierte los fallos en aviso, para no
  bloquear un despliegue urgente. Se documenta y se quita en cuanto está arreglado.
- Subir un tope es una decisión con su motivo, no un arreglo. Antes: carga diferida de lo pesado (`next/dynamic`),
  componentes de servidor y animaciones en CSS.

## Consecuencias

- Una regresión de peso rompe el build en local, antes de publicar, y dice qué ruta y cuánto.
- La medida depende del formato de los manifiestos de Next: si cambia, el script falla por no encontrar páginas (no da
  nada por bueno) y hay que adaptarlo. Está probado sobre un build de mentira en la suite y contrastado con el HTML real
  servido: sobreestima del orden de un 1–2 % (del lado seguro).
- Lighthouse «simulated» (el de por defecto) estima el LCP contando la descarga del JavaScript antes de pintar y en esta
  aplicación da entre 0,8 y 2 s más que el estrangulamiento aplicado. Las dos cifras se publican, con el método de cada
  una; hoy el objetivo LCP se cumple con estrangulamiento aplicado en local y no con el modo por defecto en la portada y
  la biblioteca. Qué método manda lo decide el propietario.
- Revisar los topes propios en cada versión que toque esas pantallas: la meta sigue siendo 200 KB.
