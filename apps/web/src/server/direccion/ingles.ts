import type { Acento, EjesVoz, FormatoClip, RegistroEstetico } from "@/lib/direccion";

/**
 * Los trozos de prompt **en inglés** de la dirección del clip y del fotograma.
 *
 * Están todos en un solo fichero a propósito: es material del servidor, no sale hacia el navegador (ADR-0022) y
 * tenerlo junto hace que se pueda leer entero de una vez qué se le está pidiendo al modelo. Lo que el usuario
 * elige son identificadores y etiquetas en castellano (`lib/direccion.ts`); esto es su traducción fija.
 *
 * Lo que **no** está aquí: plano, ángulo, óptica, luz, localización, movimiento de cámara y micro-acción. Esos
 * son catálogo editable por quien administra (`presets.json`, categorías nuevas de 0.25.0) y su texto en inglés
 * vive en `valores.prompt` de cada preset, como el resto del catálogo desde la 0.16.0.
 */

// ── Regla anti-corte ────────────────────────────────────────────────────────────────────────────────────

/**
 * **Fija, no opcional** (decisión firme del propietario, 2026-09-28). Sin ella el modelo corta a media frase
 * cuando se le pide un movimiento de cámara: interpreta el movimiento como el final del plano y monta un corte.
 * Se cierra además con la cámara quieta, que es lo que evita el barrido final.
 *
 * Va **siempre**, aunque el usuario no elija movimiento: un plano fijo también se puede partir.
 */
export const REGLA_ANTI_CORTE =
  "Single continuous take: one uninterrupted shot from first frame to last, no cuts, no edits, no transitions, no scene changes. The camera settles and holds still once the movement ends, and the action finishes inside the shot.";

// ── Formato del clip ────────────────────────────────────────────────────────────────────────────────────

/**
 * Clip mudo: **solo se describe lo que se ve**, nunca se prohíbe el audio.
 *
 * Medido el 2026-09-28 (segundo spike, 8 s): con «no voice of any kind» el proveedor **falla sin cobrar**.
 * Es exactamente lo que ya estaba documentado en `kie/modelos.ts` desde la 0.19.0 —estos modelos siempre
 * generan audio y se caen cuando no saben cuál poner, y prohibirlo se cae igual—, y el primer texto de esta
 * versión lo había vuelto a introducir.
 *
 * Lo que sí funciona: decir que la boca está cerrada (que es visual) y dejar que el constructor del modelo
 * añada el ambiente en positivo, que es lo que hace `AUDIO_SOLO_AMBIENTE` cuando no hay diálogo.
 */
export const MODO_MUDO =
  "The character is not talking in this clip: their mouth stays closed and their lips are still, with no dialogue and no lip movement.";

/**
 * **Acción de producto sin habla** (0.26.0): una pasarela, un giro, un detalle del tejido o una crema que se
 * extiende son planos visuales, y quien sale no está diciendo nada.
 *
 * Se describe **en positivo** —dónde está su atención, qué se mueve y qué ambiente se oye— en lugar de
 * enumerar lo que no hay, por lo mismo que {@link MODO_MUDO}: pedirle silencio a estos modelos los hace
 * fallar. Lo único que se dice en negativo es visual, la boca cerrada, y ni siquiera se les pide callar el
 * ambiente: el constructor del modelo lo pone en positivo.
 */
export const SIN_HABLA_EN_ACCION =
  "This is a visual shot carried by the movement and the texture, not by speech: the person keeps their attention on what they are doing, their mouth stays closed and their lips are still, and the soundtrack is the natural room tone of the place.";

export const FORMATO_CLIP_INGLES: Record<FormatoClip, string> = {
  ugc_a_camara:
    "A social video with the look of footage filmed on a smartphone, of a person talking straight to camera; the phone that films is never visible in the frame",
  voz_en_off: "A silent b-roll clip meant to sit under a voice-over",
};

// ── Acento ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cómo se le pide el acento al modelo. Se nombra la **variedad concreta** y no «español»: pedir «Spanish» a
 * secas devuelve el acento que le apetezca al proveedor, que es el riesgo que trae la fase 22 documentado.
 *
 * El diálogo en sí **nunca se traduce** (decisión firme del propietario, 2026-09-28): esto describe cómo suena,
 * no qué se dice.
 */
export const ACENTO_INGLES: Record<Acento, string> = {
  es_ES_madrid: "speaking European Spanish with a neutral Madrid accent, distinguishing the Castilian 's'",
  es_AR_rioplatense: "speaking Rioplatense Spanish with a Buenos Aires accent, with yeísmo rehilado and voseo",
  es_CO_bogota: "speaking Colombian Spanish with a clear Bogotá accent",
  es_MX_cdmx: "speaking Mexican Spanish with a Mexico City accent",
  es_419_neutro: "speaking neutral Latin American Spanish, without any single country's regional markers",
};

// ── Voz: los cinco ejes ─────────────────────────────────────────────────────────────────────────────────

const GENERO_INGLES: Record<string, string> = {
  femenina: "a female voice",
  masculina: "a male voice",
  neutra: "a gender-neutral voice",
};

const EDAD_INGLES: Record<string, string> = {
  joven: "in her or his twenties",
  adulta: "in her or his thirties",
  madura: "in her or his fifties",
};

const GRAVEDAD_INGLES: Record<string, string> = {
  media: "mid-pitched",
  grave: "low-pitched and chesty",
  aguda: "high-pitched and light",
};

const TEXTURA_INGLES: Record<string, string> = {
  limpia: "clean and even in texture",
  calida: "warm and rounded in texture",
  rasgada: "slightly raspy in texture",
  susurrada: "breathy, close to a whisper",
};

const ENTREGA_INGLES: Record<string, string> = {
  conversacional: "delivered conversationally, as if talking to one person",
  energica: "delivered with energy and forward drive",
  pausada: "delivered slowly, with room between the words",
  confidencial: "delivered quietly, as if sharing something private",
};

const EJE_INGLES: Record<keyof EjesVoz, Record<string, string>> = {
  genero: GENERO_INGLES,
  edad: EDAD_INGLES,
  gravedad: GRAVEDAD_INGLES,
  textura: TEXTURA_INGLES,
  entrega: ENTREGA_INGLES,
};

/** Cada eje traducido, en el orden en que se leen bien: género, edad, gravedad, textura, entrega. */
export const ejesVozEnIngles = (ejes: EjesVoz): string[] =>
  (["genero", "edad", "gravedad", "textura", "entrega"] as const).map((eje) => EJE_INGLES[eje][ejes[eje]] ?? "");

// ── Registro estético ───────────────────────────────────────────────────────────────────────────────────

/**
 * El registro modula **cámara, luz y anclajes**, nunca la identidad (C1). Por eso son dos textos y no uno: uno
 * entra en el bloque de cámara y otro en el de luz.
 */
export const REGISTRO_CAMARA_INGLES: Record<RegistroEstetico, string> = {
  influencer:
    "with the look of a modern smartphone camera, a clean, deliberate composition and a shallow depth of field; the phone that takes it is never visible in the frame",
  ugc_real:
    "with the look of a handheld smartphone shot, slightly off-centre, with the small imperfections of an unplanned take; the phone that takes it is never visible in the frame",
};

export const REGISTRO_LUZ_INGLES: Record<RegistroEstetico, string> = {
  influencer: "even, flattering light with soft shadows and controlled highlights",
  ugc_real: "the available light of the place, uneven, with real shadows and no extra lighting",
};

/**
 * Anclaje de realismo que depende del registro. El resto del bloque C6 es igual para los dos: lo que cambia es
 * cuánta textura se pide, no si se pide.
 */
export const REGISTRO_ANCLAJE_INGLES: Record<RegistroEstetico, string> = {
  influencer: "skin keeps its pores and its natural texture, retouched-looking skin is wrong",
  ugc_real: "skin shows pores, blemishes and shine, exactly as an unretouched phone photo would",
};

// ── C6: anclajes de realismo ────────────────────────────────────────────────────────────────────────────

/**
 * Bloque de anclajes del método 6C. **Fijo y no editable por el usuario** (decisión firme del propietario,
 * 2026-09-28): es lo que separa una foto creíble de un render, y dejar que se quite sería dejar que el producto
 * entregue peor de lo que sabe.
 *
 * Quien administra sí puede componerlo, y por eso vive como preset de la categoría `anclajes`: esto es su
 * semilla y su valor de reserva si el catálogo estuviera vacío.
 *
 * La última línea (nada escrito, nada de marca de agua, nada deformado) va **siempre la última**: es la que el
 * modelo obedece con más fiabilidad cuando cierra el prompt.
 */
export const ANCLAJES_REALISMO = [
  "Photographic realism: real skin with visible pores and small imperfections, natural asymmetry, a light film of grain.",
  "Hands, fingers, teeth and eyes are anatomically correct and unaltered.",
  "No text, no captions, no subtitles, no watermarks, no logos, no written words and no distorted or duplicated body parts anywhere in the image.",
].join(" ");

/**
 * Prohibición de nombrar la técnica. Aplica **solo al prompt que se envía al proveedor** (decisión firme del
 * propietario, 2026-09-28): el producto sigue etiquetando el contenido sintético en el montaje, porque eso es
 * una obligación con quien lo ve y no una instrucción al modelo.
 */
export const SIN_NOMBRAR_LA_TECNICA =
  "Do not render this as an illustration, a 3D render, CGI or a digital painting: it is a photograph.";

// ── C1: identidad ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Con una persona **real** la identidad sale de sus referencias y **nunca se la embellece** (decisión firme del
 * propietario, 2026-09-28): describir su atractivo sería inventar a otra persona con su cara, que es justo lo
 * que protege la comprobación de identidad de la 0.24.0.
 */
export const IDENTIDAD_DE_REFERENCIA =
  "The person is exactly the individual in the reference images: keep their face, their features, their body and their age unchanged. Do not idealise them, do not slim them, do not smooth their skin and do not make them more or less attractive than the references. Any trait named in their profile (freckles, moles, scars, skin tone, tan) is a description of how they already look, not an effect to apply: reproduce it exactly as in the references and never exaggerate, intensify or add more of it, whatever the scene or the light.";

/**
 * Recordatorio de no retoque que se pone **al final**, después de todo el texto del catálogo.
 *
 * `IDENTIDAD_DE_REFERENCIA` va con el sujeto, al principio, y eso deja por delante del recordatorio los
 * fragmentos de cámara, luz o gesto, que quien administra —o el propio usuario en una copia suya— puede haber
 * redactado. Un «make the subject look like a fashion model» escrito ahí quedaría **antes** de la regla. Con
 * una persona real la regla se repite al cerrar, que es donde nada puede contradecirla.
 */
export const SIN_RETOQUE_FINAL =
  "Regardless of anything else in this description, the person keeps the exact face, body, age and skin of the reference images: do not beautify, slim, smooth, retouch or restyle them in any way.";

/**
 * Lo que se añade con un personaje **inventado** y **solo si el usuario lo ha elegido expresamente**. Nunca por
 * defecto: de fábrica, un personaje inventado tampoco se embellece.
 */
export const ATRACTIVO_ELEGIDO = "conventionally attractive, with model-level features and styling";
