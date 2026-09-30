import type { CausaFalloProveedor } from "@/lib/causa-fallo";

/**
 * Traduce el fallo de una tarea del proveedor (`failCode` y `failMsg` de KIE) a una causa **propia** de una lista
 * cerrada. El texto del proveedor solo se mira aquí, en minúsculas, y **nunca** sale de esta función: puede
 * repetir datos de la petición, claves incluidas.
 *
 * Los patrones son conservadores a propósito: si el texto no encaja con ninguno, la causa es `desconocida` y se
 * muestra el mensaje genérico de siempre. Mejor eso que atribuir un fallo a una causa que no es.
 *
 * El orden importa: el ritmo va primero («request blocked: rate limit exceeded» no es un filtro de seguridad), y
 * la seguridad antes que la imagen («the image was blocked by safety review» es un bloqueo, no una imagen
 * ilegible).
 */
const PATRONES: readonly (readonly [CausaFalloProveedor, RegExp])[] = [
  ["limite", /rate limit|too many requests|\bquota\b/],
  // Real, visto el 2026-09-30 con Gemini Omni 1.1 Flash: «Request blocked: The generation was blocked by Google
  // safety review.» (failCode 400).
  ["bloqueo_seguridad", /\bsafety\b|\bmoderation\b|\bnsfw\b|\bflagged\b|\bblocked\b|\bsensitive (content|image)/],
  [
    "contenido_no_permitido",
    /content polic|polic(y|ies) violation|violat\w* (our |the )?(content |usage )?polic|\bprohibited\b|\bcopyright|\bpublic figure|\bcelebrit/,
  ],
  [
    "imagen_rechazada",
    /\b(image|images|reference|input file|file url|image url)\b.{0,60}\b(invalid|unsupported|inaccessible|not accessible|not found|expired|too large|could not be (downloaded|loaded|fetched|read)|failed to (download|load|fetch|read)|unable to (download|load|fetch|read|access))\b|\b(invalid|unsupported) (image|reference|file)\b|\bfailed to (download|fetch|load) (the )?(image|reference|file)/,
  ],
  ["saturado", /overloaded|\bhigh demand\b|\bat capacity\b|service unavailable|\bbusy\b/],
];

/** Códigos del sobre que por sí solos ya dicen la causa, aunque el texto venga vacío. */
const POR_CODIGO: Readonly<Record<string, CausaFalloProveedor>> = {
  "429": "limite",
  "503": "saturado",
};

export function causaDelFallo(failCode: unknown, failMsg: unknown): CausaFalloProveedor {
  const mensaje = typeof failMsg === "string" ? failMsg.toLowerCase() : "";
  if (mensaje !== "") {
    for (const [causa, patron] of PATRONES) if (patron.test(mensaje)) return causa;
  }
  const codigo = typeof failCode === "number" ? String(failCode) : typeof failCode === "string" ? failCode.trim() : "";
  return POR_CODIGO[codigo] ?? "desconocida";
}
