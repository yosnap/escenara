/** Cálculos puros del editor de imagen (sin DOM), para poder probarlos. */

export type Rotacion = 0 | 90 | 180 | 270;

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Dimensiones {
  ancho: number;
  alto: number;
}

export function girar(actual: Rotacion, sentido: 1 | -1): Rotacion {
  return ((((actual + sentido * 90) % 360) + 360) % 360) as Rotacion;
}

/** Dimensiones del lienzo tras girar: 90° y 270° intercambian ancho y alto. */
export function dimensionesGiradas({ ancho, alto }: Dimensiones, rotacion: Rotacion): Dimensiones {
  return rotacion % 180 === 0 ? { ancho, alto } : { ancho: alto, alto: ancho };
}

/**
 * Rectángulo del lienzo base que corresponde al recorte visible. El zoom escala la imagen desde su
 * centro, así que cada punto visible `p` procede de `c + (p − c) / zoom`. Sin recorte, se usa todo el lienzo.
 */
export function recorteReal(recorte: Rect | null, lienzo: Dimensiones, zoom: number): Rect {
  const r = recorte && recorte.ancho > 0 && recorte.alto > 0 ? recorte : { x: 0, y: 0, ...lienzo };
  const z = Math.max(1, zoom);
  const cx = lienzo.ancho / 2;
  const cy = lienzo.alto / 2;
  const x = Math.max(0, cx + (r.x - cx) / z);
  const y = Math.max(0, cy + (r.y - cy) / z);
  const ancho = Math.min(lienzo.ancho - x, r.ancho / z);
  const alto = Math.min(lienzo.alto - y, r.alto / z);
  return {
    x: Math.round(x),
    y: Math.round(y),
    ancho: Math.max(1, Math.round(ancho)),
    alto: Math.max(1, Math.round(alto)),
  };
}

/** Reduce proporcionalmente para caber en el máximo; nunca amplía. */
export function ajustarAMaximo(origen: Dimensiones, maximo: Dimensiones): Dimensiones {
  const escala = Math.min(1, maximo.ancho / origen.ancho, maximo.alto / origen.alto);
  return {
    ancho: Math.max(1, Math.round(origen.ancho * escala)),
    alto: Math.max(1, Math.round(origen.alto * escala)),
  };
}

export interface Proporcion {
  etiqueta: string;
  valor: number | undefined;
}

export const PROPORCIONES: Proporcion[] = [
  { etiqueta: "Libre", valor: undefined },
  { etiqueta: "1:1", valor: 1 },
  { etiqueta: "16:9", valor: 16 / 9 },
  { etiqueta: "9:16", valor: 9 / 16 },
  { etiqueta: "4:3", valor: 4 / 3 },
  { etiqueta: "3:2", valor: 3 / 2 },
];

export const ZOOM = { min: 1, max: 3, paso: 0.05 } as const;

/** Nombre del archivo editado: conserva el nombre original y cambia la extensión. */
export function nombreEditado(original: string, extension: string): string {
  const base = original.replace(/\.[^./\\]+$/, "") || "imagen";
  return `${base}-editada.${extension}`;
}
