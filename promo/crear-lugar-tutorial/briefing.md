# Briefing · Tutorial «Crear un lugar» (móvil)

Es el mismo tutorial que `../crear-lugar-tutorial-escritorio/`, que tiene las decisiones y la evidencia de cada
frase en su `briefing.md`. Cambia el dispositivo: la app se graba en móvil (viewport `movil`, el de por defecto) y
el móvil va en el centro del encuadre, con el rótulo de cada paso a su lado.

- Mismo guion, mismas acciones y mismos selectores que la versión de escritorio.
- La grabación crea de nuevo el lugar **Terraza Mirto** y genera su foto otra vez (unos 4 créditos), que
  cuenta dentro del tope de 50 créditos del tutorial. La preparación borra antes el lugar de la pasada
  anterior con `scripts/reiniciar-tutorial-recurso.ts --lugar "Terraza Mirto"`.

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm preparar --video <esta carpeta>` y después
  `pnpm video --video <esta carpeta> --sin-capturas`.
- Para repetir solo una grabación: `--solo <id> --sin-preparacion`. `lugar` no gasta; `foto-lugar` gasta unos 4
  créditos.
