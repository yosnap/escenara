import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ENTRADA_ACOTADA } from "../media/procesado";

/**
 * ¿Aparece una persona en esta imagen? Lo decide **el servidor**, en local y sin enviar la foto a nadie, con
 * YOLOX-Nano (COCO, clase «person») sobre `onnxruntime-web` en WebAssembly (ver `modelos/README.md`).
 *
 * Se usa para que una persona no se cuele como animal: un animal no declara mayoría de edad, así que sus fotos
 * no pueden ser de personas. Un detector de **caras** no sirve para esto: la cara de frente de un perro la da por
 * cara humana con casi total seguridad. Un detector de objetos distingue «persona» de «perro» o «gato».
 *
 * Si el detector no se puede cargar, el resultado es `sin_comprobar` y quien llama **no acepta la foto**: el modelo
 * va dentro de la aplicación, así que solo falla con una instalación rota, y dejar pasar fotos sin comprobar sería
 * justo el agujero que esto cierra. El fallo se registra una sola vez y la causa se dice en pantalla.
 */

export type ResultadoPersonas = "persona" | "sin_persona" | "sin_comprobar";

/** Lado de entrada del modelo. */
const LADO = 416;
/** Gris con el que YOLOX rellena el lienzo al encajar la imagen sin deformarla. */
const RELLENO = 114;
/** Pasos de la rejilla de YOLOX, en el orden en que salen sus filas. */
const PASOS = [8, 16, 32] as const;
/** Columnas por fila: 4 de caja, 1 de objeto y 80 clases de COCO. «person» es la clase 0. */
const COLUMNAS = 85;
/**
 * Confianza a partir de la cual se da por presente una persona. Medido con las fotos de prueba: una persona sale
 * por encima de 0,85 y los perros de frente por debajo de 0,07, así que el corte queda lejos de los dos.
 */
export const UMBRAL_PERSONA = 0.45;

/**
 * Confianza de la persona más clara en la salida de YOLOX (`[1, N, 85]`, objeto y clases ya en sigmoide). Va aparte
 * para poder probarla sin modelo.
 */
export function confianzaDePersona(salida: Float32Array, filas: number): number {
  const esperadas = PASOS.reduce((total, paso) => total + (LADO / paso) ** 2, 0);
  if (filas !== esperadas || salida.length < filas * COLUMNAS) {
    throw new Error(`Salida inesperada del detector: ${filas} filas, se esperaban ${esperadas}.`);
  }
  let mejor = 0;
  for (let fila = 0; fila < filas; fila++) {
    const base = fila * COLUMNAS;
    mejor = Math.max(mejor, (salida[base + 4] as number) * (salida[base + 5] as number));
  }
  return mejor;
}

/** La imagen encajada en el lienzo del modelo, en BGR y planos por canal, que es lo que espera YOLOX. */
async function tensorDe(datos: Uint8Array): Promise<Float32Array> {
  const { data } = await sharp(datos, ENTRADA_ACOTADA)
    .rotate()
    .removeAlpha()
    .resize(LADO, LADO, { fit: "contain", position: "left top", background: { r: RELLENO, g: RELLENO, b: RELLENO } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plano = LADO * LADO;
  const tensor = new Float32Array(3 * plano);
  for (let i = 0; i < plano; i++) {
    tensor[i] = data[i * 3 + 2] as number;
    tensor[plano + i] = data[i * 3 + 1] as number;
    tensor[2 * plano + i] = data[i * 3] as number;
  }
  return tensor;
}

/** Ejecuta el modelo sobre una imagen y devuelve la confianza de que haya una persona. */
type Inferencia = (datos: Uint8Array) => Promise<number>;

/** Carga el modelo y prepara la inferencia. Es lo único que toca `onnxruntime-web`. */
async function cargarInferencia(modelo: Uint8Array): Promise<Inferencia> {
  const ort = await import("onnxruntime-web");
  // Un solo hilo y sin trabajador aparte: en el servidor no hay `Worker` del navegador y no hace falta.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = "error";
  const sesion = await ort.InferenceSession.create(modelo);
  const entrada = sesion.inputNames[0];
  const nombreSalida = sesion.outputNames[0];
  if (!entrada || !nombreSalida) throw new Error("El modelo no declara entrada o salida.");
  return async (datos) => {
    const tensor = new ort.Tensor("float32", await tensorDe(datos), [1, 3, LADO, LADO]);
    const salida = (await sesion.run({ [entrada]: tensor }))[nombreSalida];
    if (!salida) throw new Error("El modelo no ha devuelto resultado.");
    return confianzaDePersona(salida.data as Float32Array, Number(salida.dims[1]));
  };
}

/** Busca el modelo junto a la aplicación: `apps/web` en producción y en desarrollo, la raíz al lanzar las pruebas. */
async function leerModelo(): Promise<Uint8Array> {
  const candidatos = [
    path.join(process.cwd(), "modelos", "yolox-nano.onnx"),
    path.join(process.cwd(), "apps", "web", "modelos", "yolox-nano.onnx"),
  ];
  for (const ruta of candidatos) {
    const datos = await readFile(ruta).catch(() => null);
    if (datos) return new Uint8Array(datos);
  }
  throw new Error(`No se encuentra el modelo en ${candidatos.join(" ni en ")}.`);
}

export interface DetectorDePersonas {
  buscar: (datos: Uint8Array) => Promise<ResultadoPersonas>;
  /** Por qué no está disponible, o `null` si funciona (o aún no se ha probado). */
  fallo: () => string | null;
}

/**
 * Detector con su carga perezosa: el modelo se carga la primera vez y se reutiliza. Si la carga falla se recuerda
 * el motivo y no se reintenta en cada foto. Una imagen que no se puede analizar tampoco se da por comprobada.
 */
export function crearDetector(cargar: () => Promise<Uint8Array> = leerModelo): DetectorDePersonas {
  let inferencia: Promise<Inferencia> | null = null;
  let motivo: string | null = null;
  return {
    fallo: () => motivo,
    async buscar(datos) {
      inferencia ??= cargar().then(cargarInferencia);
      let ejecutar: Inferencia;
      try {
        ejecutar = await inferencia;
      } catch (error) {
        if (motivo === null) {
          motivo = error instanceof Error ? error.message : String(error);
          console.error(`[vision] no se ha podido cargar el detector de personas: ${motivo}`);
        }
        return "sin_comprobar";
      }
      try {
        return (await ejecutar(datos)) >= UMBRAL_PERSONA ? "persona" : "sin_persona";
      } catch (error) {
        console.error(
          `[vision] no se ha podido analizar una imagen: ${error instanceof Error ? error.message : error}`,
        );
        return "sin_comprobar";
      }
    },
  };
}

/** Detector de la aplicación, compartido por todas las peticiones. */
export const detectorDePersonas = crearDetector();
