// Curvas de movimiento compartidas. Entradas con muelle suave (sin rebotes
// bruscos) y salidas cortas; nada parpadea ni destella.
import { Easing, interpolate, spring } from "remotion";

export const FPS = 30;

/** Progreso 0→1 de una entrada con muelle que empieza en el cuadro `desde`. */
export function entrada(cuadro: number, desde: number, duracion = 18) {
  return spring({ frame: cuadro - desde, fps: FPS, durationInFrames: duracion, config: { damping: 200, mass: 0.8 } });
}

/** Progreso 0→1 lineal con suavizado entre dos cuadros. */
export function tramo(cuadro: number, desde: number, hasta: number, curva = Easing.inOut(Easing.cubic)) {
  return interpolate(cuadro, [desde, hasta], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: curva,
  });
}

/** Opacidad de salida en los últimos cuadros de la escena. */
export function salida(cuadro: number, total: number, duracion = 8) {
  return interpolate(cuadro, [total - duracion, total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Estilo de aparición: sube y se enfoca. */
export function aparecer(p: number, distancia = 40): React.CSSProperties {
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * distancia}px)`,
    filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined,
  };
}
