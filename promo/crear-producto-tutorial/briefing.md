# Briefing · Tutorial «Crear un producto» (móvil)

Es el mismo tutorial que `../crear-producto-tutorial-escritorio/`, que tiene las decisiones y la evidencia de cada
frase en su `briefing.md`. Cambia el dispositivo: la app se graba en móvil (viewport `movil`, el de por defecto) y
el móvil va en el centro del encuadre, con el rótulo de cada paso a su lado.

- Mismo guion, mismas acciones y mismos selectores que la versión de escritorio.
- La grabación crea de nuevo el producto **Botella Ondina** y genera sus dos vistas otra vez dentro de la ficha (unos 8 créditos), que
  cuentan dentro del tope de 50 créditos del tutorial. La preparación borra antes el producto de la pasada
  anterior con `scripts/reiniciar-tutorial-recurso.ts --producto "Botella Ondina"`.

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`.
- Para repetir solo una grabación: `--solo <id> --sin-preparacion`. `producto` gasta unos 8 créditos (dos vistas).
