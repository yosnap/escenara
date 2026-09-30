// Capturas reales de la interfaz que usa el vídeo. La lista vive en
// video/capturas.json (compartida con scripts/preparar.mjs, que las copia a
// salida/publico/capturas y comprueba sus dimensiones).
import catalogo from "../capturas.json";

export const CAPTURAS = catalogo.usadas;
export type NombreCaptura = keyof typeof catalogo.usadas;
export type Region = { x: number; y: number; w: number; h: number };

/** Región completa de una captura. */
export const entera = (n: NombreCaptura): Region => ({ x: 0, y: 0, w: CAPTURAS[n].w, h: CAPTURAS[n].h });
