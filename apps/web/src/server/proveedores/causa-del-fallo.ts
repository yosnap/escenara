import type { CausaFalloProveedor } from "@/lib/causa-fallo";

/**
 * Traduce el fallo de una tarea del proveedor (`failCode` y `failMsg` de KIE) a una causa **propia** de una lista
 * cerrada. El texto del proveedor solo se mira aquí, en minúsculas, y **nunca** sale de esta función: puede
 * repetir datos de la petición, claves incluidas.
 *
 * Los patrones son **estrictos** a propósito: si el texto no dice la causa con palabras explícitas, la causa es
 * `desconocida` y se muestra el mensaje genérico de siempre. Mejor eso que afirmar una causa falsa y dar un consejo
 * equivocado. Por eso:
 *
 * - «blocked» a secas no es un filtro de seguridad («Your account is blocked», «blocked by upstream network»): hace
 *   falta que el texto hable de seguridad o moderación del contenido;
 * - «image» a secas no es una imagen rechazada («Image generation failed: invalid prompt» habla del modelo de imagen,
 *   no de la referencia): hace falta nombrar la imagen de entrada **y** un problema de formato, tamaño o acceso en la
 *   misma frase;
 * - el saldo o la cuota de la cuenta («insufficient credits», «quota exhausted») no es un exceso de ritmo, y esperar no
 *   lo arregla. Queda como `desconocida`: el saldo que no llega ya lo frena el envío antes de crear la tarea.
 *
 * El orden importa: el ritmo va primero y la seguridad antes que la imagen («the input image was blocked by safety
 * review» es un bloqueo, no una imagen ilegible).
 */
const SUJETO_IMAGEN =
  "(?:reference image|input image|source image|uploaded image|image url|image file|input file|the image)s?";
const PROBLEMA_IMAGEN =
  "(?:(?:is|was|are|were) (?:invalid|inaccessible|not accessible|corrupt(?:ed)?|expired|too large|unsupported)|too large|exceeds (?:the )?(?:maximum|max|size|limit)|(?:in )?(?:an )?unsupported (?:format|type)|(?:could not|cannot|can't) be (?:downloaded|fetched|loaded|read|accessed)|failed to (?:download|load))";

const PATRONES: readonly (readonly [CausaFalloProveedor, RegExp])[] = [
  ["limite", /\brate limit|\btoo many requests\b/],
  // Real, visto el 2026-09-30 con Gemini Omni 1.1 Flash: «Request blocked: The generation was blocked by Google
  // safety review.» (failCode 400).
  [
    "bloqueo_seguridad",
    /\bsafety\b|\bmoderation\b|\bnsfw\b|\bcontent (?:was )?(?:flagged|filtered)\b|\bsensitive content\b/,
  ],
  [
    "contenido_no_permitido",
    /\bcontent polic(?:y|ies)\b|\bpolic(?:y|ies) violation\b|\bviolat\w* (?:our |the )?(?:content |usage )?polic|\bprohibited content\b|\bcopyright(?:ed)? (?:content|material|infringement)\b|\bpublic figures?\b|\bcelebrit(?:y|ies)\b/,
  ],
  [
    "imagen_rechazada",
    new RegExp(
      String.raw`\b${SUJETO_IMAGEN}\b[^.;:,]{0,25}?\b${PROBLEMA_IMAGEN}|\b(?:failed|unable) to (?:download|fetch|load) (?:the )?(?:reference |input |source )?image\b|\b(?:invalid|unsupported) image (?:format|type|url|file)\b`,
    ),
  ],
  [
    "saturado",
    /\boverloaded\b|\bhigh demand\b|\bat capacity\b|\bservice unavailable\b|\b(?:server|service|model) is busy\b/,
  ],
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
