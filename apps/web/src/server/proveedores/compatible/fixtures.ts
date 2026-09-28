/**
 * Respuestas **reales grabadas** de un servicio compatible con la API de OpenAI (NaN builders, 2026-09-28). Los
 * tests no llaman a nadie: se contesta con esto.
 *
 * Se graban tal cual llegaron, con su texto de error incluido, **precisamente para poder comprobar que ese texto
 * no sale de aquí**: lo único que puede acabar en un mensaje del usuario es lo que extraiga la lista blanca de
 * `detalleDeErrorAjeno`.
 */

/** `GET /v1/models` → 200. Catálogo completo tal como lo devolvió ese día. */
export const MODELOS_200 = {
  object: "list",
  data: [
    "mimo-v2.6-flash",
    "rerank",
    "whisper",
    "glm5.3-flash",
    "qwen3.8-flash",
    "gemma4",
    "mimo-v2.5",
    "qwen3-embedding",
    "qwen3.6",
    "deepseek-v4-flash",
    "kokoro",
    "flux-2-klein",
    "qwen-image-2.1",
    "minimax-h3",
  ].map((id) => ({ id, object: "model", owned_by: "nan" })),
};

/** `POST /v1/chat/completions` con `gemma4` → 429: el modelo tiene tope de peticiones a la vez. */
export const CHAT_429 = {
  error: { message: "gemma4 concurrency limit: max 5 simultaneous requests.", code: "429" },
};

/** `POST /v1/chat/completions` con `deepseek-v4-flash` → 402: la cuota del plan se ha agotado. */
export const CHAT_402 = {
  error: {
    message:
      "deepseek-v4-flash allowance exhausted: 0 left. The counter resets when your allowance period rolls over, on 2026-10-01 00:00 UTC, and the model becomes available again.",
    code: "402",
  },
};

/** `POST /v1/chat/completions` con una clave revocada → 401. */
export const CHAT_401 = {
  error: { message: "invalid api key: sk-nan-XXXXXXXXXXXXXXXX is not recognised", code: "401" },
};

/** `POST /v1/chat/completions` con `glm5.3-flash` → 200 en 9,8 s. */
export const CHAT_200 = {
  id: "chatcmpl-grabada",
  object: "chat.completion",
  model: "glm5.3-flash",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "on a rooftop at dawn, looking at the camera" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 57, completion_tokens: 433, completion_tokens_details: { reasoning_tokens: 407 } },
};

/** Respuesta HTTP a partir de una de las grabaciones. */
export function respuestaGrabada(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}
