# Briefing · Tutorial «Personaje con producto» (un anuncio, móvil)

Es el mismo tutorial que `../personaje-con-producto-tutorial-escritorio/`, que tiene las decisiones y la evidencia de
cada frase en su `briefing.md`. Cambia el dispositivo: la app se graba en móvil (viewport `movil`, el de por defecto)
y el móvil va en el centro del encuadre, con el rótulo de cada paso a su lado.

- Mismo guion, mismas acciones y mismos selectores que la versión de escritorio.
- La grabación genera de nuevo el fotograma de Brisa y el clip con la Botella Ondina (unos 48 créditos de KIE), que
  cuentan dentro del tope de 300 créditos del tutorial. No se reutiliza el clip de escritorio: la clave de cada
  confirmación es aleatoria (`panel-generar.tsx:122`) y enseñarlo exigiría interceptar el envío.

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>` (graba y renderiza) o
  `pnpm preparar --video <esta carpeta>` y después `pnpm video --video <esta carpeta> --sin-capturas`.
