/** Referencias de un único fotograma: no crean un lugar ni alteran la identidad del personaje. */
export const USOS_REFERENCIA = {
  lugar: "Lugar",
  ropa: "Ropa",
  pose: "Pose",
  composicion: "Composición",
  estilo: "Estilo",
} as const;
export type UsoReferencia = keyof typeof USOS_REFERENCIA;
export interface ReferenciaTemporal {
  medioId: string;
  etiqueta: string;
  uso: UsoReferencia;
}
export const MAXIMO_REFERENCIAS_TEMPORALES = 4;
export function identidadOriginalParaLugar(
  ids: readonly string[],
  elegibles: readonly { mediaId: string; origen: string }[],
  soloOriginales: boolean,
  personaje: { virtual: boolean; renderStyle: string },
): string[] {
  if (!soloOriginales || personaje.virtual || personaje.renderStyle === "animado") return [...ids];
  const originales = new Set(elegibles.filter((r) => r.origen === "foto_original").map((r) => r.mediaId));
  return ids.filter((id) => originales.has(id));
}
export const tieneLugarBase = (valor: unknown): boolean =>
  leerReferenciasTemporales(valor).some((r) => r.uso === "lugar");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerReferenciasTemporales(valor: unknown): ReferenciaTemporal[] {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > MAXIMO_REFERENCIAS_TEMPORALES)
    throw new Error("Puedes añadir hasta cuatro referencias temporales.");
  const etiquetas = new Set<string>();
  const medios = new Set<string>();
  return valor.map((entrada) => {
    if (!entrada || typeof entrada !== "object") throw new Error("Esa referencia no es válida.");
    const { medioId, etiqueta, uso } = entrada;
    if (typeof medioId !== "string" || !UUID.test(medioId)) throw new Error("Elige una imagen para cada referencia.");
    if (typeof etiqueta !== "string" || !/^[a-z][a-z0-9_-]{0,29}$/.test(etiqueta))
      throw new Error("La etiqueta debe empezar por una letra y usar minúsculas, números o guiones, sin la arroba.");
    if (typeof uso !== "string" || !Object.hasOwn(USOS_REFERENCIA, uso))
      throw new Error("Indica qué aporta cada referencia.");
    if (etiquetas.has(etiqueta) || medios.has(medioId))
      throw new Error("Cada referencia necesita una etiqueta y una imagen diferentes.");
    etiquetas.add(etiqueta);
    medios.add(medioId);
    return { medioId, etiqueta, uso: uso as UsoReferencia };
  });
}

/** Con un lugar, la primera imagen es la fotografía que se edita; las demás aportan rasgos concretos. */
export function referenciasOrdenadas(referencias: readonly ReferenciaTemporal[]): ReferenciaTemporal[] {
  const lugares = referencias.filter((r) => r.uso === "lugar");
  if (lugares.length > 1) throw new Error("Elige una sola imagen como lugar base de la escena.");
  return [...lugares, ...referencias.filter((r) => r.uso !== "lugar")];
}

export function ordenarImagenesDeEscena<T>(
  identidad: readonly T[],
  otras: readonly T[],
  temporales: readonly T[],
  lugarBase: boolean,
): T[] {
  return lugarBase ? [...temporales, ...identidad, ...otras] : [...identidad, ...otras, ...temporales];
}

/** Las restricciones de rótulos nuevos no deben borrar los que ya existen en la foto que se conserva. */
export function promptParaLugarBase(prompt: string, identidad: number, temporales: number): string {
  const limpio = prompt.replace(
    /No text, no captions, no subtitles, no watermarks, no logos, no written words and /gi,
    "No added captions, subtitles or watermarks. No ",
  );
  return `PHOTO EDITING TASK. Image 1 is the base photograph, not an inspiration image. Preserve its architecture, existing signs and lettering, objects, colours, ground plane, camera position and perspective. Do not invent a different location or reinterpret its design. Only add the selected character performing the requested action, with natural contact shadows and human scale.\nIDENTITY LOCK: Images ${temporales + 1} through ${temporales + identidad} show the same selected person. Copy their facial structure, age, hairline, glasses, facial hair, skin and body proportions faithfully; do not create a lookalike, slim them down or beautify them. Preserve their clothing unless the scene explicitly requests another outfit.\n${limpio}`;
}

export function resolverMenciones(
  texto: string,
  referencias: readonly ReferenciaTemporal[],
  primeraImagen: number,
): string {
  return texto.replace(/(?<![\w.])@([a-zA-Z][a-zA-Z0-9_-]*)/g, (_, etiqueta: string) => {
    const indice = referencias.findIndex((r) => r.etiqueta === etiqueta);
    if (indice < 0) throw new Error(`La etiqueta @${etiqueta} no tiene una imagen de referencia.`);
    return `reference image ${primeraImagen + indice}`;
  });
}

export function exigirCupoTemporal(maximo: number, otras: number, temporales: number): void {
  if (temporales > 0 && otras + temporales > maximo)
    throw new Error(
      `El modelo admite ${maximo} imágenes y este envío necesita ${otras + temporales}. Quita referencias o elige otro modelo; ninguna se omitirá en silencio.`,
    );
}

const INSTRUCCIONES: Record<UsoReferencia, string> = {
  lugar: "Preserve the location, background, architecture and spatial layout of this image.",
  ropa: "Preserve the clothing, materials, colours and accessories of this image, fitted to the selected character.",
  pose: "Use only the body pose and gesture from this image.",
  composicion: "Preserve the framing, camera angle and spatial arrangement of this image.",
  estilo: "Use only the lighting, colour palette and visual treatment of this image.",
};
export function instruccionesTemporales(referencias: readonly ReferenciaTemporal[], primeraImagen: number): string {
  if (!referencias.length) return "";
  return (
    "VISUAL REFERENCES FOR THIS SHOT:\n" +
    referencias
      .map(
        (r, i) =>
          `Image ${primeraImagen + i}: ${INSTRUCCIONES[r.uso]} This reference takes priority over generic descriptions for that aspect only. Do not copy the identity or face of any person in this reference. Keep the selected character's identity from its own references.`,
      )
      .join("\n")
  );
}
