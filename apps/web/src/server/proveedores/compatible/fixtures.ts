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

/**
 * `POST /v1/audio/speech` con `kokoro` → 200 con los bytes del audio. Lo que devuelve el servicio es un MP3; en
 * los tests basta con unos bytes con la firma de un MP3, porque lo que se comprueba es el camino, no el sonido.
 */
export const VOZ_MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export function respuestaDeAudio(bytes: Uint8Array = VOZ_MP3): Response {
  return new Response(bytes, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

/**
 * `POST /v1/audio/transcriptions` con `model=whisper` y `response_format=verbose_json` → 200. Grabado contra la
 * API real el 2026-09-28: transcribió exacto un clip de 4 s en español.
 */
export const TRANSCRIPCION_200 = {
  task: "transcribe",
  language: "es",
  duration: 4.02,
  text: "Buenos días, esto es una prueba de la pista de voz.",
  segments: [
    { id: 0, start: 0, end: 2.1, text: " Buenos días," },
    { id: 1, start: 2.1, end: 4.02, text: " esto es una prueba de la pista de voz." },
  ],
};
