import sharp from "sharp";
import { LARGO_HUELLA, type MetricasCalidad, type UmbralesCalidad } from "@/lib/captura-personaje";
import type { Ajustes } from "../ajustes";
import { ENTRADA_ACOTADA, MAXIMO_PIXELES } from "../media/procesado";

/**
 * Control de calidad de una foto de referencia, **local y sin gastar créditos** (decisión 2 de la fase 14):
 * resolución, nitidez por varianza del laplaciano, luminancia media y huella perceptual para los duplicados.
 * Todo con el `sharp` que ya usa la biblioteca para reducir las imágenes (`media/procesado.ts`).
 *
 * Nada de esto sale del servidor: se calcula sobre los bytes que ya están guardados, se resume en cuatro
 * números y una huella de 64 bits, y no se escribe en ningún registro. La huella **no** permite reconstruir
 * la foto; solo comparar dos fotos entre sí.
 *
 * Tres precauciones, porque estos bytes vienen de un archivo que ha subido alguien:
 *
 * - **un solo decodificado por foto**: se saca una copia reducida en gris y de ella salen las tres medidas
 *   *y* la huella. Antes se decodificaba dos veces la misma imagen;
 * - **tope de píxeles** (`limitInputPixels`) y **una sola página** (`pages: 1`): una imagen con dimensiones
 *   enormes declaradas en la cabecera —o un GIF de mil fotogramas— no puede convertir una subida en un
 *   bloqueo del servidor. El tamaño se comprueba **en la cabecera**, antes de decodificar nada;
 * - el tamaño relativo de la cara no se mide aquí: no hay detector de caras en el servidor y meter un modelo
 *   sería justo lo que la fase deja para 0.20.0. Lo mide el navegador cuando puede, y solo avisa.
 */

/** Lado al que se reduce la imagen para medir. Suficiente para el laplaciano y barato de calcular. */
const LADO_ANALISIS = 256;

/** Lado de la huella perceptual: 9 × 8 comparaciones horizontales = 64 bits. */
const LADO_HUELLA = 8;

export interface AnalisisImagen {
  /** Métricas con `caraRelativa` a `null`: la cara la mide el navegador, no el servidor. */
  metricas: MetricasCalidad;
  /** Huella perceptual (dHash) en hexadecimal, o `null` si la imagen no se ha podido medir. */
  huella: string | null;
  /** `true` si la imagen declara más píxeles de los que se aceptan: no se ha decodificado. */
  demasiadoGrande: boolean;
}

/** Umbrales del control de calidad tal como están configurados en Admin › Ajustes. */
export const umbralesDe = (ajustes: Ajustes): UmbralesCalidad => ({
  ladoMinimo: ajustes.calidadLadoMinimo,
  nitidezMinima: ajustes.calidadNitidezMinima,
  luminosidadMinima: ajustes.calidadLuminosidadMinima,
  luminosidadMaxima: ajustes.calidadLuminosidadMaxima,
  caraMinima: ajustes.calidadCaraMinima,
});

/**
 * Varianza del laplaciano de una matriz de luminancia. Es la medida clásica de enfoque: una foto nítida tiene
 * bordes fuertes (laplaciano con mucha variación) y una movida los tiene todos suavizados.
 */
function varianzaDelLaplaciano(gris: Uint8Array, ancho: number, alto: number): number {
  if (ancho < 3 || alto < 3) return 0;
  let suma = 0;
  let sumaCuadrados = 0;
  let total = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const laplaciano =
        4 * (gris[i] as number) -
        (gris[i - 1] as number) -
        (gris[i + 1] as number) -
        (gris[i - ancho] as number) -
        (gris[i + ancho] as number);
      suma += laplaciano;
      sumaCuadrados += laplaciano * laplaciano;
      total++;
    }
  }
  if (total === 0) return 0;
  const media = suma / total;
  return Math.max(0, sumaCuadrados / total - media * media);
}

/** Luminancia media de la matriz, 0–255. */
function luminanciaMedia(gris: Uint8Array): number {
  if (gris.length === 0) return 0;
  let suma = 0;
  for (const valor of gris) suma += valor;
  return suma / gris.length;
}

/** Media de un bloque de la matriz reducida, para muestrear la huella sin volver a decodificar. */
function mediaDeBloque(
  gris: Uint8Array,
  ancho: number,
  alto: number,
  columna: number,
  fila: number,
  columnas: number,
  filas: number,
): number {
  const x0 = Math.floor((columna * ancho) / columnas);
  const x1 = Math.max(x0 + 1, Math.floor(((columna + 1) * ancho) / columnas));
  const y0 = Math.floor((fila * alto) / filas);
  const y1 = Math.max(y0 + 1, Math.floor(((fila + 1) * alto) / filas));
  let suma = 0;
  let total = 0;
  for (let y = y0; y < Math.min(y1, alto); y++) {
    for (let x = x0; x < Math.min(x1, ancho); x++) {
      suma += gris[y * ancho + x] as number;
      total++;
    }
  }
  return total === 0 ? 0 : suma / total;
}

/**
 * Huella perceptual dHash **a partir de la copia reducida que ya se ha decodificado**: se promedia la matriz
 * en 9 × 8 bloques y cada bit dice si un bloque es más claro que el de su derecha. Sobrevive a la recompresión
 * y al cambio de tamaño, que es justo lo que hace la biblioteca al guardar, así que la misma foto subida dos
 * veces da la misma huella.
 */
function huellaPerceptual(gris: Uint8Array, ancho: number, alto: number): string {
  const columnas = LADO_HUELLA + 1;
  let bits = "";
  for (let fila = 0; fila < LADO_HUELLA; fila++) {
    const valores = Array.from({ length: columnas }, (_, columna) =>
      mediaDeBloque(gris, ancho, alto, columna, fila, columnas, LADO_HUELLA),
    );
    for (let columna = 0; columna < LADO_HUELLA; columna++) {
      bits += (valores[columna] as number) > (valores[columna + 1] as number) ? "1" : "0";
    }
  }
  // Nibble a nibble para no depender de la precisión de los enteros grandes de JavaScript.
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.padStart(LARGO_HUELLA, "0");
}

const VACIO: AnalisisImagen = {
  metricas: { ancho: 0, alto: 0, nitidez: 0, luminosidad: 0, caraRelativa: null },
  huella: null,
  demasiadoGrande: false,
};

/**
 * Mide una imagen. Si `sharp` no sabe leerla, devuelve métricas en cero y huella `null`; si declara más
 * píxeles de los aceptados, lo dice sin decodificarla. La decisión de rechazarla es de quien llama, que es el
 * que conoce los umbrales.
 */
export async function analizarImagen(datos: Uint8Array): Promise<AnalisisImagen> {
  try {
    // La cabecera primero. Leer metadatos **no decodifica** los píxeles, así que se lee sin el tope (si no,
    // `sharp` fallaría al abrir la imagen y no sabríamos por qué) y el tope se aplica aquí, a mano: un lienzo
    // enorme se descarta sin decodificar una sola fila.
    const meta = await sharp(datos, { ...ENTRADA_ACOTADA, limitInputPixels: false }).metadata();
    const ancho = meta.width ?? 0;
    const alto = meta.pageHeight ?? meta.height ?? 0;
    if (ancho === 0 || alto === 0) return VACIO;
    if (ancho * alto > MAXIMO_PIXELES) {
      return { ...VACIO, metricas: { ...VACIO.metricas, ancho, alto }, demasiadoGrande: true };
    }
    // **Único** decodificado: una copia reducida en gris. De ella salen las tres medidas y la huella.
    const { data, info } = await sharp(datos, ENTRADA_ACOTADA)
      .greyscale()
      .resize({ width: LADO_ANALISIS, height: LADO_ANALISIS, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gris = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return {
      metricas: {
        // El ancho y el alto son los de la imagen **de verdad**, no los de la copia reducida.
        ancho,
        alto,
        nitidez: Math.round(varianzaDelLaplaciano(gris, info.width, info.height) * 100) / 100,
        luminosidad: Math.round(luminanciaMedia(gris) * 100) / 100,
        caraRelativa: null,
      },
      huella: huellaPerceptual(gris, info.width, info.height),
      demasiadoGrande: false,
    };
  } catch (error) {
    // Ni el nombre del archivo ni nada del usuario: solo que no se ha podido medir.
    console.error(`[personajes] no se ha podido medir la calidad de una imagen: ${(error as Error).name}`);
    return VACIO;
  }
}
