/**
 * Respuestas **grabadas** de los dos servicios de la coherencia (0.24.0). Los tests no llaman a nadie: se
 * contesta con esto.
 *
 * - **Jev** (TypeSafe, `POST /v1/systemone`): la forma está tomada de su referencia pública, comprobada el
 *   2026-09-28 (https://docs.typesafe.ai/api.md). `noul` devuelve una sola probabilidad; `choice` y `score`
 *   devuelven su distribución y su confianza. El coste se factura **solo por tokens de entrada**
 *   (42 $ por mil millones), y por eso `usage` trae los dos por separado;
 * - **la percepción** (NaN builders, `POST /v1/chat/completions`): la forma es la de OpenAI, la misma que ya
 *   usaba el mapa de texto desde la 0.21.1.
 *
 * Se graban con su texto tal cual, **incluido el de los errores**, precisamente para poder comprobar que ese texto
 * no sale de aquí: lo único que llega a un mensaje del usuario es lo que extraiga la lista blanca de
 * `detalleDeErrorAjeno`.
 */

/** `GET /v1/models` de TypeSafe → 200. Es la llamada que **no cuesta nada** y prueba la clave. */
export const JEV_MODELOS_200 = {
  object: "list",
  data: [
    { id: "jev-latest", object: "model", created: 1_790_000_000 },
    { id: "jev-preview", object: "model", created: 1_790_000_000 },
    { id: "jev-1.13.0", object: "model", created: 1_789_000_000 },
  ],
};

/** `noul` con las dos caras muy parecidas: es la misma persona, y con poca duda. */
export const JEV_IDENTIDAD_SI = {
  model: "jev-1.13.0",
  answers: { coherencia: { type: "noul", noul: 0.94 } },
  usage: { input_tokens: 412, output_tokens: 8 },
};

/** `noul` con dos caras distintas: no es la misma persona, y tampoco hay duda. */
export const JEV_IDENTIDAD_NO = {
  model: "jev-1.13.0",
  answers: { coherencia: { type: "noul", noul: 0.06 } },
  usage: { input_tokens: 408, output_tokens: 8 },
};

/**
 * `noul` en la frontera: 0,58 de probabilidad son 0,16 de confianza, que no llega a ningún umbral razonable. El
 * veredicto tiene que ser «míralo tú», **no** un «pasa» flojo.
 */
export const JEV_IDENTIDAD_DUDOSA = {
  model: "jev-1.13.0",
  answers: { coherencia: { type: "noul", noul: 0.58 } },
  usage: { input_tokens: 400, output_tokens: 8 },
};

/** `score` de guion: la escena no cubre lo que cuenta el guion (nivel 1 de 4). */
export const JEV_GUION_FLOJO = {
  model: "jev-1.13.0",
  answers: {
    coherencia: {
      type: "score",
      score: 0.9,
      legend: ["Contradicts it", "Mostly unrelated", "Partially covers it", "Covers it fully"],
      probabilities: { "0": 0.21, "1": 0.7, "2": 0.08, "3": 0.01 },
      confidence: 0.82,
    },
  },
  usage: { input_tokens: 296, output_tokens: 20 },
};

/** `choice` de emoción: la voz suena alegre y el guion es triste. */
export const JEV_EMOCION_OPUESTA = {
  model: "jev-1.13.0",
  answers: {
    coherencia: {
      type: "choice",
      choice: "opuesta",
      probabilities: { coincide: 0.03, parecida: 0.06, neutra: 0.09, opuesta: 0.82 },
      confidence: 0.86,
    },
  },
  usage: { input_tokens: 331, output_tokens: 12 },
};

/** `POST /v1/systemone` con una clave revocada → 401. */
export const JEV_401 = { error: { message: "invalid api key: ts-XXXXXXXXXXXX is not recognised", type: "auth_error" } };

/** Percepción de una cara con `gemma4`, tal como la escribe un modelo de visión al que se le pide describir. */
export const PERCEPCION_CARA = {
  id: "chatcmpl-percepcion-cara",
  object: "chat.completion",
  model: "gemma4",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content:
          "Oval face with a narrow chin and high cheekbones. Dark brown almond-shaped eyes, thick straight eyebrows. Straight narrow nose, medium-width mouth with a fuller lower lip. Light olive skin, small mole below the left eye. Framing is a bust shot; the expression is neutral.",
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1204, completion_tokens: 61 },
};

/** Percepción del audio de un clip con `mimo-v2.5`: transcripción, emoción, ritmo y ambiente. */
export const PERCEPCION_AUDIO = {
  id: "chatcmpl-percepcion-audio",
  object: "chat.completion",
  model: "mimo-v2.5",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content:
          "The speaker says: «por fin lo conseguimos». The voice sounds bright and cheerful, with a rising intonation at the end. The pace is fast and the volume is high. In the background there is light room tone and no music.",
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 3810, completion_tokens: 48 },
};

/** Respuesta HTTP a partir de una de las grabaciones. */
export function respuestaGrabada(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}
