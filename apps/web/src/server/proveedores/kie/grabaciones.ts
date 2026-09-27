/**
 * Respuestas grabadas de KIE.ai, transcritas de las llamadas reales del prototipo de la 0.3.0 y de la
 * comparativa de modelos del 2026-09-27 (`plans/reports/comparativa-260927-modelos-kie.md`). Sirven para
 * probar el adaptador **sin gastar créditos del propietario**: ningún test llama al servicio de verdad.
 *
 * Todas las respuestas de KIE son HTTP 200 con un sobre `{ code, msg, data }`: el error real está en
 * `code`. Los identificadores y las URL se han sustituido por valores inventados; los números (créditos
 * consumidos, tiempos) son los medidos.
 */

export interface Grabacion {
  /** Estado HTTP con el que respondió el servicio. */
  estado: number;
  cuerpo: unknown;
}

const sobre = (data: unknown): Grabacion => ({ estado: 200, cuerpo: { code: 200, msg: "success", data } });

/** `GET /api/v1/chat/credit`: el saldo llega como número suelto en `data`. */
export const SALDO: Grabacion = sobre(214);

/** `POST file-stream-upload`: la referencia subida y su URL temporal (KIE la borra en unas horas). */
export const SUBIDA: Grabacion = sobre({
  fileName: "referencia.png",
  filePath: "escenara/referencias/referencia.png",
  downloadUrl: "https://tempfile.redpandaai.co/escenara/referencias/referencia.png",
});

/** `POST /api/v1/jobs/createTask`: lo único que devuelve es el identificador de la tarea. */
export const TAREA_CREADA: Grabacion = sobre({ taskId: "2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7" });

/** `GET /api/v1/jobs/recordInfo` recién creada la tarea. */
export const TAREA_EN_COLA: Grabacion = sobre({
  taskId: "2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7",
  model: "veo3_lite",
  state: "waiting",
  resultJson: "",
  failCode: "",
  failMsg: "",
  costTime: null,
  creditsConsumed: null,
});

export const TAREA_GENERANDO: Grabacion = sobre({
  taskId: "2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7",
  model: "veo3_lite",
  state: "generating",
  resultJson: "",
  failMsg: "",
  costTime: null,
  creditsConsumed: null,
});

/** Clip de `veo3_lite` terminado: 60 créditos por 4 s, como se midió. */
export const TAREA_LISTA_VIDEO: Grabacion = sobre({
  taskId: "2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7",
  model: "veo3_lite",
  state: "success",
  resultJson: '{"resultUrls":["https://tempfile.redpandaai.co/resultados/clip.mp4"]}',
  failMsg: "",
  costTime: 148,
  creditsConsumed: 60,
});

/** Fotograma de `nano-banana-2-lite` terminado: 4 créditos por imagen. */
export const TAREA_LISTA_IMAGEN: Grabacion = sobre({
  taskId: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
  model: "nano-banana-2-lite",
  state: "success",
  resultJson: '{"resultUrls":["https://tempfile.redpandaai.co/resultados/fotograma.png"]}',
  failMsg: "",
  costTime: 36,
  creditsConsumed: 4,
});

/** Tarea que el proveedor no ha podido completar. Su texto nunca se propaga. */
export const TAREA_FALLIDA: Grabacion = sobre({
  taskId: "2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7",
  model: "veo3_lite",
  state: "fail",
  resultJson: "",
  failCode: "500",
  failMsg: "generation failed for request with key sk-clave-que-el-proveedor-repite",
  costTime: 12,
  creditsConsumed: 0,
});

/** Errores del sobre, tal como los devuelve KIE (HTTP 200 y el error en `code`). */
export const ERROR_CLAVE: Grabacion = { estado: 200, cuerpo: { code: 401, msg: "Unauthorized", data: null } };
export const ERROR_SIN_CREDITO: Grabacion = {
  estado: 200,
  cuerpo: { code: 402, msg: "Insufficient credits", data: null },
};
export const ERROR_LIMITE: Grabacion = { estado: 200, cuerpo: { code: 429, msg: "Too many requests", data: null } };
export const ERROR_SERVIDOR: Grabacion = { estado: 200, cuerpo: { code: 500, msg: "Internal error", data: null } };
/** Respuesta que no cumple el sobre: puede pasar con un proxy o un error de la plataforma. */
export const RESPUESTA_RARA: Grabacion = { estado: 200, cuerpo: { mensaje: "vaya" } };

/** Convierte una grabación en la `Response` que devolvería `fetch`. */
export function respuestaDe(grabacion: Grabacion): Response {
  return new Response(JSON.stringify(grabacion.cuerpo), {
    status: grabacion.estado,
    headers: { "Content-Type": "application/json" },
  });
}
