# Briefing · Tutorial «Personaje con producto» (un anuncio, móvil)

Es el mismo tutorial que `../personaje-con-producto-tutorial-escritorio/`, que tiene las decisiones y la evidencia de
cada frase en su `briefing.md`. Cambia el dispositivo: la app se graba en móvil (viewport `movil`, el de por defecto)
y el móvil va en el centro del encuadre, con el rótulo de cada paso a su lado.

- Mismo guion, mismas acciones y mismos selectores que la versión de escritorio, salvo el tramo `clip`: tras la
  espera recorre el paso del clip (modelo, frase, instrucciones y la tarjeta «Listo») antes de llegar al vídeo. En
  móvil el vídeo tarda unos segundos en cargar a través del proxy del motor y, si se llega antes, sale en negro.
- La grabación genera de nuevo el fotograma de Brisa y el clip con la Botella Ondina (unos 44 créditos de KIE), que
  cuentan dentro del tope de 300 créditos del tutorial. No se reutiliza el clip de escritorio: la clave de cada
  confirmación es aleatoria (`panel-generar.tsx:122`) y enseñarlo exigiría interceptar el envío.

- El final (escenas «Míralo» y «Y después») sale de la grabación `resultado`, igual que en escritorio, con el clip
  de móvil (trabajo `0196c040-aba6-4e96-9a6f-21705968997f`), sin gastar créditos.

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>` (graba y renderiza) o
  `pnpm preparar --video <esta carpeta>` y después `pnpm video --video <esta carpeta> --sin-capturas`.
