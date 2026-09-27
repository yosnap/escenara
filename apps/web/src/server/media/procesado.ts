import sharp from "sharp";
import { MAX_IMAGEN } from "@/lib/media/reglas";
import type { TipoDetectado } from "./deteccion";

export interface ImagenProcesada {
  datos: Uint8Array;
  mime: string;
  extension: string;
  ancho: number;
  alto: number;
}

/**
 * Tope de píxeles de entrada: 40 megapíxeles son más que cualquier cámara de fotos de consumo, y la biblioteca
 * guarda las imágenes reducidas a 1920 × 1080. Por encima no se decodifica.
 */
export const MAXIMO_PIXELES = 40_000_000;

/**
 * Opciones con las que se abre **siempre** una imagen que ha subido alguien: tope de píxeles, una sola página y
 * sin animación. Viven aquí, con el resto de las herramientas de imagen, porque las usan todos los sitios que
 * decodifican bytes ajenos (el control de calidad de las referencias y el montaje de la hoja de personaje): una
 * segunda copia de estas opciones sería una puerta abierta a olvidarse de una.
 */
export const ENTRADA_ACOTADA = { limitInputPixels: MAXIMO_PIXELES, pages: 1, animated: false } as const;

/**
 * Medidas de una imagen **sin tocarla**. Es lo que se usa en los documentos de consentimiento, que se guardan
 * tal cual: hacen falta el ancho y el alto para reservar el hueco al mostrarlos, pero el archivo no se recorta
 * ni se reconvierte, porque un documento reducido puede dejar de ser legible.
 */
export async function medidasDeImagen(datos: Uint8Array): Promise<{ ancho: number | null; alto: number | null }> {
  try {
    const meta = await sharp(datos).metadata();
    return { ancho: meta.width ?? null, alto: meta.pageHeight ?? meta.height ?? null };
  } catch {
    // Un documento que sharp no sabe medir se guarda igual: las medidas solo sirven para el hueco del visor.
    return { ancho: null, alto: null };
  }
}

/** Una celda de la hoja de contacto: la imagen y el rótulo que va debajo. */
export interface CeldaHoja {
  datos: Uint8Array;
  /** Vista o nombre de la foto. Se escribe tal cual: lo compone el servidor, no llega del navegador. */
  etiqueta: string;
}

/** Lado de cada celda de la hoja de personaje y alto de la banda del rótulo, en píxeles. */
const LADO_CELDA = 480;
const BANDA_ROTULO = 44;
const ALTO_CABECERA = 88;
/** Como mucho tres columnas: con más, cada foto queda demasiado pequeña para juzgar la identidad. */
const COLUMNAS_MAXIMAS = 3;
/** Fotos que se decodifican a la vez al montar la hoja. Tres: ni serie lenta ni nueve `sharp` en paralelo. */
const CELDAS_A_LA_VEZ = 3;

/** Aplica `tarea` en tandas de `tamano`, conservando el orden. Acota la concurrencia sin traer una dependencia. */
async function enTandas<T, R>(
  elementos: readonly T[],
  tamano: number,
  tarea: (elemento: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < elementos.length; i += tamano) {
    resultados.push(...(await Promise.all(elementos.slice(i, i + tamano).map(tarea))));
  }
  return resultados;
}

/**
 * Texto apto para el SVG del rótulo. Se **recorta antes de escapar**: al revés, el recorte podría partir una
 * entidad (`&#38` sin el punto y coma) y dejar el SVG mal formado, que es justo lo que haría fallar el montaje.
 */
const escaparXml = (texto: string) => texto.slice(0, 120).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Compone la **hoja de personaje**: un montaje de sus referencias en cuadrícula, con el nombre arriba y la
 * vista debajo de cada foto (decisión 2 de la fase 15). Se hace aquí, con el mismo `sharp` que ya reduce las
 * imágenes al subirlas: **sin IA y sin coste**, así que regenerarla es gratis.
 *
 * Fondo neutro y plano a propósito: es una zona de claridad, no una pieza decorativa. Si los rótulos no se
 * pueden dibujar (una instalación sin tipografías para SVG), se devuelve el montaje sin ellos en lugar de
 * fallar: una hoja sin rótulos sigue siendo útil.
 */
export async function montarHojaDeContacto(nombre: string, celdas: readonly CeldaHoja[]): Promise<ImagenProcesada> {
  if (celdas.length === 0) throw new Error("No hay referencias con las que componer la hoja de personaje.");
  const columnas = Math.min(COLUMNAS_MAXIMAS, celdas.length);
  const filas = Math.ceil(celdas.length / columnas);
  const ancho = columnas * LADO_CELDA;
  const alto = ALTO_CABECERA + filas * (LADO_CELDA + BANDA_ROTULO);

  // Cada foto se abre con las **mismas** opciones acotadas que el control de calidad y, sobre todo, se
  // decodifican **de tres en tres**: con nueve fotos de golpe, `Promise.all` pone a `sharp` a abrir nueve
  // imágenes a la vez y una sola hoja puede comerse la memoria y los hilos del servidor.
  const recortadas = await enTandas(celdas, CELDAS_A_LA_VEZ, (celda) =>
    sharp(celda.datos, ENTRADA_ACOTADA)
      .rotate()
      .resize({ width: LADO_CELDA, height: LADO_CELDA, fit: "cover", position: "top" })
      .png()
      .toBuffer(),
  );
  const capas = recortadas.map((datos, i) => ({
    input: datos,
    left: (i % columnas) * LADO_CELDA,
    top: ALTO_CABECERA + Math.floor(i / columnas) * (LADO_CELDA + BANDA_ROTULO),
  }));

  const lienzo = sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 245, g: 245, b: 244 } },
  }).composite([...capas, ...rotulos(nombre, celdas, columnas, ancho)]);

  const { data, info } = await lienzo
    .webp({ quality: 88 })
    .toBuffer({ resolveWithObject: true })
    .catch(async () => {
      // Sin rótulos: el montaje solo con las fotos, que es lo que de verdad sirve de referencia.
      return sharp({
        create: { width: ancho, height: alto, channels: 3, background: { r: 245, g: 245, b: 244 } },
      })
        .composite(capas)
        .webp({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
    });
  return { datos: new Uint8Array(data), mime: "image/webp", extension: "webp", ancho: info.width, alto: info.height };
}

/** Capa de texto de la hoja: el nombre arriba y la vista debajo de cada foto. */
function rotulos(nombre: string, celdas: readonly CeldaHoja[], columnas: number, ancho: number) {
  const textos = celdas.map((celda, i) => {
    const x = (i % columnas) * LADO_CELDA + LADO_CELDA / 2;
    const y = ALTO_CABECERA + Math.floor(i / columnas) * (LADO_CELDA + BANDA_ROTULO) + LADO_CELDA + 29;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#44403c">${escaparXml(celda.etiqueta)}</text>`;
  });
  const alto = ALTO_CABECERA + Math.ceil(celdas.length / columnas) * (LADO_CELDA + BANDA_ROTULO);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><text x="${ancho / 2}" y="58" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="bold" fill="#1c1917">${escaparXml(nombre)}</text>${textos.join("")}</svg>`;
  return [{ input: Buffer.from(svg), left: 0, top: 0 }];
}

/**
 * Optimiza una imagen: orienta según EXIF, reduce a 1920 × 1080 como máximo sin ampliar y la guarda
 * en WebP con calidad 85. Los GIF se conservan intactos para no perder la animación. Sharp descarta
 * los metadatos (EXIF, GPS) al volver a codificar.
 */
export async function procesarImagen(datos: Uint8Array, detectado: TipoDetectado): Promise<ImagenProcesada> {
  if (detectado.mime === "image/gif") {
    const meta = await sharp(datos).metadata();
    return {
      datos,
      mime: detectado.mime,
      extension: detectado.extension,
      ancho: meta.width ?? 0,
      alto: meta.pageHeight ?? meta.height ?? 0,
    };
  }
  const { data, info } = await sharp(datos, { animated: detectado.mime === "image/webp" })
    .rotate()
    .resize({ width: MAX_IMAGEN.ancho, height: MAX_IMAGEN.alto, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return {
    datos: new Uint8Array(data),
    mime: "image/webp",
    extension: "webp",
    ancho: info.width,
    alto: info.pageHeight ?? info.height,
  };
}
