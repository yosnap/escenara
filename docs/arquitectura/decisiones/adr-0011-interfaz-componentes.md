# ADR-0011 · Pila de interfaz y catálogo de componentes

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.4.0

## Contexto

La dirección visual «Escenario» (marca 0.5.0) pide una interfaz colorida, animada y accesible. El propietario exige además:

1. Una **página de componentes en el admin** con todos los componentes reutilizables del proyecto, construida **antes** que cualquier pantalla.
2. **Ningún `<select>` nativo del navegador** en todo el proyecto: los desplegables de selección única y múltiple («caja» con varias opciones) son componentes modernos.
3. Un **selector de medios (media picker)** reutilizable, cuya especificación dará el propietario.

## Decisión

| Necesidad | Elección |
|---|---|
| Estilos | Tailwind CSS 4 con variables CSS generadas desde `docs/branding/escenara.brand.json` |
| Primitivas accesibles | Base UI (`@base-ui/react`): Select, Combobox (única y múltiple), Dialog, Popover, Menu, Tabs, Tooltip, Switch, Checkbox, Radio… sin estilos propios |
| Animación y parallax | Motion y animaciones CSS ligadas al scroll, siempre con `prefers-reduced-motion` |
| Iconos | Lucide |
| Tipografía | Manrope variable autoalojada (`@fontsource-variable/manrope`, licencia OFL) |

- Todos los componentes viven en `apps/web/src/components/ui/` y se muestran en **`/admin/componentes`** con sus variantes y estados. Una pantalla nueva solo usa componentes del catálogo; si falta uno, primero se añade al catálogo.
- **Prohibido `<select>` nativo:** un test recorre el código fuente y falla si encuentra el elemento.
- **Prohibidos los bordes o sombras de color en un solo lateral** de tarjetas y bloques (norma del propietario): otro test lo comprueba.
- Hasta que exista autenticación (0.6.0), `/admin/componentes` solo está disponible en desarrollo.

## Consecuencias

- Estilo y comportamiento consistentes en toda la app, y un único lugar para revisar accesibilidad y temas.
- Base UI no impone estética, lo que permite la capa vibrante sin pelear con estilos de terceros.
- El media picker queda reservado en el catálogo hasta recibir su especificación.
