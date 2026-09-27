import { type Buscador, codigoDeEstado, codigoDeFallo } from "../codigos";
import { ErrorKie } from "./cliente";

/**
 * Modelos de texto de KIE («Market → Chat», comprobado en https://docs.kie.ai/market/chat/gpt-5-6-sol el
 * 2026-09-27, sin llamar a la API con ninguna clave).
 *
 * Es el único endpoint de KIE que **no** sigue el patrón asíncrono de `jobs/createTask`: contesta en la misma
 * petición y **no** usa el sobre `{ code, msg, data }`, sino la forma de la API de respuestas de OpenAI. De ahí
 * que tenga su propio lector en lugar de reusar el de `cliente.ts`.
 *
 * Reglas, las mismas que en el resto del proveedor:
 *
 * - la clave llega por parámetro y solo viaja en la cabecera `Authorization`;
 * - la URL es fija: nada de lo que llega del navegador entra en ella (no hay SSRF posible);
 * - del proveedor no se conserva su texto de error, solo un código propio;
 * - lo que devuelve **no es de fiar**: aquí solo se extrae la cadena, y quien la usa la trata como propuesta.
 */

const API = "https://api.kie.ai";
/**
 * Escribir un guion tarda más que consultar un estado y menos que generar un vídeo. 90 s: medido el 2026-09-27
 * con la clave real, un guion de cuatro escenas tardó hasta 37 s, así que el tope anterior de 45 s se quedaba a
 * un suspiro de cortar una respuesta ya pagada. Por encima de esto lo que hay es un problema.
 */
export const MS_TEXTO = 90_000;

export interface RespuestaTexto {
  /** Texto generado, tal cual lo devuelve el proveedor. **No confiable**: hay que limpiarlo antes de usarlo. */
  texto: string;
  /** Créditos que informa el proveedor (`credits_consumed`); `null` si no los informa. */
  creditos: number | null;
}

interface CuerpoRespuesta {
  output?: unknown;
  credits_consumed?: unknown;
}

/**
 * Pide un texto al modelo. `instrucciones` las compone **siempre el servidor**; `entrada` es el contenido del
 * usuario, ya limpio y delimitado por quien llama.
 */
export async function generarTextoKie(
  clave: string,
  model: string,
  instrucciones: string,
  entrada: string,
  buscar: Buscador = fetch,
): Promise<RespuestaTexto> {
  let respuesta: Response;
  try {
    respuesta = await buscar(`${API}/codex/v1/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: instrucciones },
          { role: "user", content: entrada },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(MS_TEXTO),
    });
  } catch (error) {
    throw new ErrorKie(codigoDeFallo(error));
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorKie(porEstado);
  let cuerpo: CuerpoRespuesta;
  try {
    cuerpo = (await respuesta.json()) as CuerpoRespuesta;
  } catch {
    throw new ErrorKie("respuesta-inesperada");
  }
  // Un `output` que no se entiende **no descarta los créditos**: si el proveedor informa lo que ha cobrado, eso
  // es lo que se apunta. Quien llama trata el texto vacío como respuesta inservible y cierra el gasto con el dato
  // informado, en lugar de perderlo y quedarse con nuestra estimación.
  return {
    texto: textoDeSalida(cuerpo.output),
    creditos:
      typeof cuerpo.credits_consumed === "number" && Number.isFinite(cuerpo.credits_consumed)
        ? cuerpo.credits_consumed
        : null,
  };
}

/**
 * Texto de la respuesta: `output` es una lista de bloques y solo los de tipo `message` traen contenido
 * (`output_text`). Los bloques de razonamiento se descartan, y un `output` que no se entiende da cadena vacía
 * en lugar de un texto a medias.
 */
function textoDeSalida(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const trozos: string[] = [];
  for (const bloque of output) {
    if (!bloque || typeof bloque !== "object") continue;
    const b = bloque as { type?: unknown; content?: unknown };
    if (b.type !== "message" || !Array.isArray(b.content)) continue;
    for (const parte of b.content) {
      if (!parte || typeof parte !== "object") continue;
      const p = parte as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string") trozos.push(p.text);
    }
  }
  return trozos.join("").trim();
}
