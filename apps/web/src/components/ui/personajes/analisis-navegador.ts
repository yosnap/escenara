"use client";

import { dimensionesTrasReducir, type MetricasCalidad } from "@/lib/captura-personaje";
import { MAX_IMAGEN } from "@/lib/media/reglas";

/**
 * Control de calidad **en el navegador**, antes de subir nada (RF03). Es el mismo cálculo que hace el servidor
 * (`server/personajes/calidad.ts`) con los mismos umbrales, así que la foto que la interfaz marca en rojo es
 * exactamente la que el servidor va a rechazar.
 *
 * Privacidad: todo pasa en la máquina del usuario, sobre un lienzo que se descarta al terminar. Lo único que
 * llega al servidor son cuatro números, y solo si el usuario decide subir la foto.
 *
 * El tamaño relativo de la cara es lo único que el servidor **no** puede medir, así que se mide aquí con
 * `FaceDetector` cuando el navegador lo trae; donde no existe, se devuelve `null` y el control se queda en
 * resolución, nitidez y luz, avisando de que la cara no se ha comprobado.
 */

/** Lado al que se reduce la imagen para medir; el mismo que usa el servidor. */
const LADO_ANALISIS = 256;

/** Fuente que se puede medir: la imagen ya cargada o el fotograma del visor de la cámara. */
export type FuenteMedible = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

function tamanoDe(fuente: FuenteMedible): { ancho: number; alto: number } {
  if (fuente instanceof HTMLVideoElement) return { ancho: fuente.videoWidth, alto: fuente.videoHeight };
  if (fuente instanceof HTMLImageElement) return { ancho: fuente.naturalWidth, alto: fuente.naturalHeight };
  return { ancho: fuente.width, alto: fuente.height };
}

/** Luminancia (Rec. 601) de la fuente reducida, junto con el tamaño de la matriz. */
function luminancia(fuente: FuenteMedible): { gris: Float32Array; ancho: number; alto: number } | null {
  const { ancho, alto } = tamanoDe(fuente);
  if (ancho === 0 || alto === 0) return null;
  const escala = Math.min(1, LADO_ANALISIS / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  const contexto = lienzo.getContext("2d", { willReadFrequently: true });
  if (!contexto) return null;
  contexto.drawImage(fuente, 0, 0, w, h);
  const { data } = contexto.getImageData(0, 0, w, h);
  const gris = new Float32Array(w * h);
  for (let i = 0; i < gris.length; i++) {
    const p = i * 4;
    gris[i] = 0.299 * (data[p] as number) + 0.587 * (data[p + 1] as number) + 0.114 * (data[p + 2] as number);
  }
  return { gris, ancho: w, alto: h };
}

function varianzaDelLaplaciano(gris: Float32Array, ancho: number, alto: number): number {
  if (ancho < 3 || alto < 3) return 0;
  let suma = 0;
  let sumaCuadrados = 0;
  let total = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const l =
        4 * (gris[i] as number) -
        (gris[i - 1] as number) -
        (gris[i + 1] as number) -
        (gris[i - ancho] as number) -
        (gris[i + ancho] as number);
      suma += l;
      sumaCuadrados += l * l;
      total++;
    }
  }
  if (total === 0) return 0;
  const media = suma / total;
  return Math.max(0, sumaCuadrados / total - media * media);
}

/** Detector de caras del navegador. No está en todos, así que se comprueba en tiempo de ejecución. */
interface DetectorDeCaras {
  detect(fuente: FuenteMedible): Promise<{ boundingBox: { width: number; height: number } }[]>;
}

declare global {
  interface Window {
    /** `FaceDetector` de la Shape Detection API: solo existe en algunos navegadores (Chrome en Android). */
    FaceDetector?: new (opciones?: {
      fastMode?: boolean;
    }) => DetectorDeCaras;
  }
}

/** `true` si este navegador sabe detectar caras: la interfaz lo dice en lugar de callarse. */
export const hayDetectorDeCaras = (): boolean =>
  typeof window !== "undefined" && "FaceDetector" in window && typeof window.FaceDetector === "function";

/**
 * Proporción del lado menor que ocupa la cara más grande (0–1), o `null` si no se puede medir. Un fallo del
 * detector no es un error del usuario: se devuelve `null` y el control sigue con lo demás.
 */
async function proporcionDeCara(fuente: FuenteMedible): Promise<number | null> {
  if (!hayDetectorDeCaras()) return null;
  const { ancho, alto } = tamanoDe(fuente);
  if (ancho === 0 || alto === 0) return null;
  try {
    const Detector = window.FaceDetector;
    if (!Detector) return null;
    const caras = await new Detector({ fastMode: true }).detect(fuente);
    if (caras.length === 0) return 0;
    const mayor = Math.max(...caras.map((c) => Math.max(c.boundingBox.width, c.boundingBox.height)));
    return Math.min(1, mayor / Math.min(ancho, alto));
  } catch {
    return null;
  }
}

/**
 * Mide una imagen o un fotograma del visor. Devuelve `null` si el navegador no ha podido leer los píxeles.
 *
 * `medirCara` decide si se busca una cara: en un cuerpo entero o en un animal no tiene sentido, y el aviso
 * saldría siempre (ver `midaCara` en `lib/captura-personaje.ts`).
 */
export async function medirEnNavegador(
  fuente: FuenteMedible,
  { medirCara = true }: { medirCara?: boolean } = {},
): Promise<MetricasCalidad | null> {
  const datos = luminancia(fuente);
  if (!datos) return null;
  const { gris, ancho, alto } = datos;
  let suma = 0;
  for (const valor of gris) suma += valor;
  // El tamaño que se juzga es el que **va a quedar guardado**: la biblioteca reduce a `MAX_IMAGEN` al subir, y
  // el servidor mide ese archivo. Si aquí se juzgara el original, una foto enorme pasaría el control en el
  // navegador y el servidor la rechazaría después por pequeña.
  const real = tamanoDe(fuente);
  const guardado = dimensionesTrasReducir(real.ancho, real.alto, MAX_IMAGEN);
  return {
    ancho: guardado.ancho,
    alto: guardado.alto,
    nitidez: Math.round(varianzaDelLaplaciano(gris, ancho, alto) * 100) / 100,
    luminosidad: Math.round((suma / gris.length) * 100) / 100,
    caraRelativa: medirCara ? await proporcionDeCara(fuente) : null,
  };
}
