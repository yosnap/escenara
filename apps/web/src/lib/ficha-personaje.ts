import { type EstiloRender, GUIA_ESTILO_VACIA, type GuiaEstiloAnimado } from "./animados";
import { type ReferenciaParaCobertura, type Vista, vistasMinimas } from "./captura-personaje";
import type { TipoPersonaje } from "./personajes";

/**
 * Ficha de personaje y **contexto de generación** (RF02, 0.15.0). Aquí no hay nada que dependa de la base de
 * datos ni del navegador: solo la forma de la ficha, su limpieza y cómo se convierte en el bloque de contexto
 * que se añade al prompt.
 *
 * Reglas duras de la versión:
 *
 * - **el prompt lo compone el servidor**. La ficha es texto que escribe una persona, así que antes de entrar
 *   en un prompt se limpia: longitud acotada, sin saltos de línea, sin caracteres de estructura y sin
 *   parámetros ni instrucciones que intenten cambiar lo que se le pide al proveedor;
 * - **solo la apariencia versiona**. Los campos de esta ficha (más la descripción) son lo que cambia lo que
 *   se le envía al modelo; el nombre y las notas privadas no crean versión;
 * - la limpieza es la **misma** función en el servidor y en el navegador, así que lo que el usuario ve como
 *   «contexto aplicado» antes de confirmar es exactamente lo que se enviará.
 */

/** Campos tipados de la ficha. Cada uno es texto libre acotado: la apariencia no se deja modelar en enums. */
export interface FichaPersonaje {
  /** Rasgos físicos: edad aparente, complexión, pelo, ojos, piel, señas. */
  rasgos: string;
  /** Estilo visual: estética, época, referencias de imagen. */
  estilo: string;
  /** Vestuario habitual del personaje. */
  vestuario: string;
  /** Personalidad y forma de estar: lo que se le nota en la cara y en la postura. */
  personalidad: string;
  /** Voz prevista. Se **declara** aquí; la voz real es de 0.21.0. */
  voz: string;
}

export const CAMPOS_FICHA = ["rasgos", "estilo", "vestuario", "personalidad", "voz"] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number];

export const FICHA_VACIA: FichaPersonaje = { rasgos: "", estilo: "", vestuario: "", personalidad: "", voz: "" };

export const ETIQUETA_CAMPO_FICHA: Record<CampoFicha, string> = {
  rasgos: "Rasgos físicos",
  estilo: "Estilo visual",
  vestuario: "Vestuario habitual",
  personalidad: "Personalidad",
  voz: "Voz prevista",
};

export const AYUDA_CAMPO_FICHA: Record<CampoFicha, string> = {
  rasgos: "Edad aparente, complexión, pelo, ojos, piel y señas que no deberían cambiar entre escenas.",
  estilo: "Estética con la que se le retrata: época, luz, referencias visuales.",
  vestuario: "Lo que suele llevar puesto. Cada escena puede cambiarlo en su descripción.",
  personalidad: "Cómo está delante de la cámara: gesto, energía, postura.",
  voz: "Cómo suena (timbre, ritmo, acento). Aquí solo se declara: la voz real llega en una versión posterior.",
};

/** Tope por campo. Corto a propósito: es contexto que se suma a cada prompt, no una biografía. */
export const CAMPO_FICHA_MAXIMO = 300;

/** Tope del bloque de contexto ya compuesto. Por encima, el modelo deja de atender a la escena. */
export const CONTEXTO_MAXIMO = 900;

/** Rótulo de la descripción en el bloque de contexto. Va primero: es la presentación del personaje. */
const ROTULO_DESCRIPCION = "Descripción";

/** Etiqueta con la que cada campo entra en el bloque de contexto. Fija: la escribe el servidor. */
const ROTULO_CONTEXTO: Record<CampoFicha, string> = {
  rasgos: "Rasgos físicos",
  estilo: "Estilo visual",
  vestuario: "Vestuario",
  personalidad: "Actitud",
  voz: "Voz",
};

/**
 * Nombres de parámetros del proveedor que **nunca** pueden llegar desde la ficha: si alguien escribe
 * «aspect_ratio: 21:9» en su vestuario, eso no es vestuario, es un intento de cambiar lo que se envía.
 */
const PARAMETROS_PROHIBIDOS = [
  "aspect_ratio",
  "aspectratio",
  "aspect",
  "resolution",
  "resolucion",
  "seed",
  "steps",
  "cfg",
  "cfg_scale",
  "guidance",
  "guidance_scale",
  "duration",
  "duracion",
  "segundos",
  "model",
  "modelo",
  "negative_prompt",
  "negativo",
  "width",
  "height",
  "ancho",
  "alto",
  "quality",
  "calidad",
  "output",
  "format",
  "formato",
  "callback",
  "callback_url",
  "url",
  "image_urls",
  "input_urls",
  "image_url",
] as const;

/** Caracteres de estructura: llaves, corchetes, ángulos, tuberías, comillas de bloque y contrabarras. */
const ESTRUCTURA = /[{}[\]<>|`\\]/g;

/** Guiones que se usan como guion: el normal, el corto, el largo y el de resta tipográfico. */
const GUION = "-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212";

/**
 * Parámetros al estilo de línea de órdenes: `--ar 16:9`, `-seed=42`, `—ar 16:9` (con guion largo, que es lo
 * que escribe un corrector automático). Se come también el valor que va detrás cuando empieza por un número:
 * si no, el valor se quedaría solo dentro del prompt.
 */
const BANDERAS = new RegExp(
  `(^|\\s)[${GUION}]{1,2}[a-z][\\w${GUION}]*(?:\\s*[=:]\\s*\\S+|\\s+\\d[\\w:./${GUION}]*)?`,
  "gi",
);

/** Guiones que se quedan sueltos después de quitar una bandera. */
const GUIONES_SUELTOS = new RegExp(`(^|\\s)[${GUION}]{1,3}(?=\\s|$)`, "g");

/** `clave: valor` o `clave=valor` donde la clave es un parámetro del proveedor. */
const ASIGNACION_PROHIBIDA = new RegExp(`\\b(?:${PARAMETROS_PROHIBIDOS.join("|")})\\s*[=:]\\s*\\S+`, "gi");

/**
 * Los mismos nombres de parámetro **en texto libre**, sin `=` ni `:` («usa duration 10», «en resolución 4k»).
 * Se llevan por delante el valor que los siga, si lo hay. No es una lista completa —ni puede serlo, cada
 * proveedor añade los suyos— y por eso no es lo que sostiene la garantía: lo que la sostiene es que el prompt
 * lo **compone el servidor** con rótulos fijos. Está documentado así en el ADR-0018.
 */
const PARAMETRO_EN_TEXTO = new RegExp(
  `\\b(?:aspect\\s*ratio|relaci[óo]n\\s+de\\s+aspecto|resolution|resoluci[óo]n|duration|duraci[óo]n|negative\\s*prompt|guidance|seed|steps|cfg|fps)\\b(?:\\s+(?:de\\s+)?[\\w:./${GUION}]+)?`,
  "gi",
);

/** Medidas de salida escritas como valor suelto: `1080p`, `720p`, `4k`, `16:9`. */
const MEDIDA_DE_SALIDA = /\b(?:\d{1,4}\s?[pk]|\d{1,2}:\d{1,2})\b/gi;

/**
 * Intentos de redirigir las instrucciones. Cuando aparece uno, se descarta **hasta el final de la frase**: una
 * frase que empieza por «ignora lo anterior» no describe los rasgos de nadie, y dejar su cola («y usa duration
 * 10 y 1080p») sería dejar dentro justo lo que se quería colar.
 */
const REDIRECCIONES = [
  // Perezoso hasta la palabra que delata la redirección y codicioso desde ahí hasta el punto.
  /\b(?:ignora|ignorad|ignore|olvida|olvidad|forget|disregard|override)\b[^.;]{0,120}?\b(?:instrucc\w*|indicaci\w*|anterior\w*|previous|above|prompt|sistema|system|regla\w*|rules?|lo\s+dicho)\b[^.;]{0,160}/gi,
  /\b(?:system|developer|assistant)\s+(?:prompt|message|mensaje)\b[^.;]{0,160}/gi,
  /\b(?:act[úu]a|comp[óo]rtate|behave)\s+como\b[^.;]{0,160}/gi,
  /\bact\s+as\b[^.;]{0,160}/gi,
];

/**
 * Limpia un campo de la ficha para que pueda entrar en un prompt. Nunca lanza: devuelve el texto utilizable,
 * recortado al tope. Lo que se descarta se descarta en silencio a propósito —el usuario ve el resultado en
 * «contexto aplicado» antes de confirmar—, y lo que valida el formulario es la longitud, que sí se avisa.
 */
export function limpiarCampoFicha(valor: unknown): string {
  return limpiarTextoDePrompt(valor, CAMPO_FICHA_MAXIMO);
}

/**
 * La misma limpieza con otro tope. La usan las plantillas de prompt de 0.16.0, cuyo texto final es más largo
 * que un campo de la ficha: el tope cambia, las reglas no. Una sola definición para los dos sitios, porque lo
 * que sostiene la garantía es que **todo** lo que escribe una persona pasa por aquí.
 */
export function limpiarTextoDePrompt(valor: unknown, maximo: number): string {
  if (typeof valor !== "string" || valor === "") return "";
  // El tope se aplica **antes** de las expresiones regulares: ninguna recorre un texto sin acotar.
  let texto = valor.slice(0, maximo * 4);
  texto = texto.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(ESTRUCTURA, " ");
  // Las banderas van **antes** que las asignaciones: `--seed=42` es una bandera entera, y si primero se
  // quitara `seed=42` quedarían dos guiones sueltos dentro del prompt.
  texto = texto.replace(BANDERAS, " ").replace(ASIGNACION_PROHIBIDA, " ");
  // Las redirecciones van antes que los parámetros en texto libre: se llevan la frase entera, cola incluida.
  for (const patron of REDIRECCIONES) texto = texto.replace(patron, " ");
  texto = texto.replace(PARAMETRO_EN_TEXTO, " ").replace(MEDIDA_DE_SALIDA, " ");
  texto = texto.replace(GUIONES_SUELTOS, " ");
  return (
    texto
      .replace(/\s+/g, " ")
      // La puntuación se recoloca: quitar una frase deja espacios delante del punto y puntos duplicados.
      .replace(/\s+([.,;:])/g, "$1")
      .replace(/([.;])[\s.;]*[.;]/g, "$1")
      // Y la que se queda al principio («: eres otro») no aporta nada.
      .replace(/^[\s:;,.·-]+/, "")
      .trim()
      .slice(0, maximo)
  );
}

/** Limpia la ficha entera campo a campo. */
export function limpiarFicha(ficha: Partial<Record<CampoFicha, unknown>>): FichaPersonaje {
  return {
    rasgos: limpiarCampoFicha(ficha.rasgos),
    estilo: limpiarCampoFicha(ficha.estilo),
    vestuario: limpiarCampoFicha(ficha.vestuario),
    personalidad: limpiarCampoFicha(ficha.personalidad),
    voz: limpiarCampoFicha(ficha.voz),
  };
}

/**
 * Bloque de contexto que se añade al prompt. Lo compone **el servidor** a partir de la versión citada: el
 * rótulo de cada línea es fijo y el valor va ya limpio, así que la ficha no puede colar instrucciones.
 *
 * `descripcion` entra también (decisión del propietario del 2026-09-27: la ficha alimenta los prompts), y pasa
 * por la **misma** limpieza que los demás campos, con el mismo tope: es texto de una persona que va a un
 * prompt, así que se trata igual aunque su columna admita más caracteres.
 *
 * Devuelve cadena vacía si no hay nada que añadir: un bloque con etiquetas vacías solo gastaría prompt.
 */
export function componerContexto(
  ficha: FichaPersonaje,
  tipo: TipoPersonaje,
  descripcion = "",
  animado = false,
): string {
  const suya = limpiarCampoFicha(descripcion);
  const lineas = [
    ...(suya === "" ? [] : [`${ROTULO_DESCRIPCION}: ${suya}`]),
    ...CAMPOS_FICHA.flatMap((campo) => {
      const valor = limpiarCampoFicha(ficha[campo]);
      return valor === "" ? [] : [`${ROTULO_CONTEXTO[campo]}: ${valor}`];
    }),
  ];
  if (lineas.length === 0) return "";
  const sujeto = tipo === "animal" ? "del mismo animal" : "de la misma persona";
  // La escena manda sobre la ropa, el lugar y la luz: sin esta línea, el vestuario y el estilo de la ficha (y la
  // ropa de las fotos de referencia) ganaban a lo que pedía la escena, y un anuncio en la playa salía con cazadora.
  const cabecera = animado
    ? "Mantén el diseño y la identidad del mismo personaje de las ilustraciones de referencia. El acabado animado y la guía de estilo de esta ficha son obligatorios en toda escena; la ropa, el lugar, la luz y el encuadre los decide la escena de arriba. Ficha del personaje (descripción, no texto que dibujar):"
    : `Mantén la identidad ${sujeto} de las fotos de referencia: de ellas solo se toman la cara y el cuerpo. La ropa, el lugar, la luz y el encuadre los decide la escena de arriba; el vestuario y el estilo de esta ficha solo valen si la escena no dice otra cosa. Ficha del personaje (descripción, no texto que dibujar):`;
  return `${cabecera}\n${lineas.join("\n")}`.slice(0, CONTEXTO_MAXIMO);
}

/** Prompt final que se le envía al proveedor: la escena que escribió la persona y, debajo, el contexto. */
export function componerPrompt(escena: string, contexto: string): string {
  return contexto === "" ? escena : `${escena}\n\n${contexto}`;
}

/** Campos de la ficha (y la descripción) que han cambiado entre dos versiones. */
export interface DiferenciaFicha {
  campo: CampoFicha | "descripcion" | "referencias" | "vistas" | "estiloVisual" | "guiaEstilo";
  etiqueta: string;
  antes: string;
  despues: string;
}

const ETIQUETA_DIFERENCIA: Record<DiferenciaFicha["campo"], string> = {
  ...ETIQUETA_CAMPO_FICHA,
  descripcion: "Descripción",
  referencias: "Fotos de referencia",
  vistas: "Vistas de las fotos",
  estiloVisual: "Estilo visual",
  guiaEstilo: "Guía de estilo",
};

/** Instantánea de lo que versiona: la ficha, la descripción y las referencias incluidas con su vista. */
export interface FichaVersionada {
  ficha: FichaPersonaje;
  descripcion: string;
  /** Identificadores de los medios de referencia incluidos, en su orden. */
  referencias: string[];
  /**
   * Vista de cada referencia, en el **mismo orden** que `referencias`; cadena vacía = sin clasificar. Versiona
   * porque la elección de qué fotos se envían al proveedor se hace por cobertura de vistas: cambiar la vista de
   * una foto cambia lo que se envía, aunque la lista de fotos sea la misma.
   */
  vistas: string[];
  renderStyle?: EstiloRender;
  styleGuide?: GuiaEstiloAnimado;
}

/** Cuántas referencias de una instantánea tienen vista asignada. Es lo que se muestra al comparar versiones. */
const clasificadas = (instantanea: FichaVersionada): number => instantanea.vistas.filter((v) => v !== "").length;

/**
 * Diferencias entre dos instantáneas, en el orden en que se muestran. Las referencias no se comparan una a
 * una: lo que se dice es cuántas había, porque la lista de identificadores no significa nada para nadie.
 */
export function diferenciasDeFicha(antes: FichaVersionada, despues: FichaVersionada): DiferenciaFicha[] {
  const cambios: DiferenciaFicha[] = [];
  const estiloAntes = antes.renderStyle ?? "realista";
  const estiloDespues = despues.renderStyle ?? "realista";
  if (estiloAntes !== estiloDespues) {
    cambios.push({
      campo: "estiloVisual",
      etiqueta: ETIQUETA_DIFERENCIA.estiloVisual,
      antes: estiloAntes,
      despues: estiloDespues,
    });
  }
  const guiaAntes = antes.styleGuide ?? GUIA_ESTILO_VACIA;
  const guiaDespues = despues.styleGuide ?? GUIA_ESTILO_VACIA;
  if (JSON.stringify(guiaAntes) !== JSON.stringify(guiaDespues)) {
    cambios.push({
      campo: "guiaEstilo",
      etiqueta: ETIQUETA_DIFERENCIA.guiaEstilo,
      antes: guiaAntes.preset || "Sin guía",
      despues: guiaDespues.preset || "Sin guía",
    });
  }
  for (const campo of CAMPOS_FICHA) {
    if (antes.ficha[campo] !== despues.ficha[campo]) {
      cambios.push({
        campo,
        etiqueta: ETIQUETA_DIFERENCIA[campo],
        antes: antes.ficha[campo],
        despues: despues.ficha[campo],
      });
    }
  }
  if (antes.descripcion !== despues.descripcion) {
    cambios.push({
      campo: "descripcion",
      etiqueta: ETIQUETA_DIFERENCIA.descripcion,
      antes: antes.descripcion,
      despues: despues.descripcion,
    });
  }
  const mismas =
    antes.referencias.length === despues.referencias.length &&
    antes.referencias.every((id, i) => despues.referencias[i] === id);
  if (!mismas) {
    cambios.push({
      campo: "referencias",
      etiqueta: ETIQUETA_DIFERENCIA.referencias,
      antes: `${antes.referencias.length}`,
      despues: `${despues.referencias.length}`,
    });
  } else if (antes.vistas.some((vista, i) => despues.vistas[i] !== vista)) {
    // Las mismas fotos en el mismo orden, pero alguna con otra vista: también cambia lo que se envía al
    // proveedor, porque las referencias se eligen por cobertura de vistas. Se dice aparte para que el historial
    // no muestre «6 fotos → 6 fotos», que no explicaría por qué existe la versión.
    cambios.push({
      campo: "vistas",
      etiqueta: ETIQUETA_DIFERENCIA.vistas,
      antes: `${clasificadas(antes)} de ${antes.referencias.length} clasificadas`,
      despues: `${clasificadas(despues)} de ${despues.referencias.length} clasificadas`,
    });
  }
  return cambios;
}

/** Referencia con lo mínimo para elegir las mejores: su identificador, su vista y su origen. */
export interface ReferenciaElegible extends ReferenciaParaCobertura {
  mediaId: string;
}

/**
 * Las **mejores** referencias hasta el tope que admite el modelo, elegidas por **cobertura de vistas**
 * (0.14.0): primero una foto original de cada vista mínima, en el orden del catálogo de vistas; después las
 * demás fotos originales; y al final las vistas generadas, que guían el encuadre pero no son fotos de nadie.
 *
 * Con diez huecos y quince fotos, esto envía una de cada ángulo en lugar de diez del mismo: es lo que
 * sostiene la identidad entre fotogramas.
 */
export function mejoresReferencias(
  tipo: TipoPersonaje,
  referencias: readonly ReferenciaElegible[],
  maximo: number,
): string[] {
  if (maximo < 1) return [];
  const elegidas: string[] = [];
  const usadas = new Set<string>();
  const tomar = (candidata: ReferenciaElegible | undefined) => {
    if (!candidata || usadas.has(candidata.mediaId) || elegidas.length >= maximo) return;
    usadas.add(candidata.mediaId);
    elegidas.push(candidata.mediaId);
  };
  const originales = referencias.filter((r) => r.origen === "foto_original");
  for (const vista of vistasMinimas(tipo)) tomar(originales.find((r) => r.vistaClave === vista));
  for (const referencia of originales) tomar(referencia);
  for (const referencia of referencias.filter((r) => r.origen === "vista_generada")) tomar(referencia);
  return elegidas;
}

/** Vistas que cubren las referencias elegidas, para poder decirlo en «contexto aplicado». */
export function vistasDeReferencias(
  referencias: readonly ReferenciaElegible[],
  elegidas: readonly string[],
): (Vista | null)[] {
  const porId = new Map(referencias.map((r) => [r.mediaId, r]));
  return elegidas.map((id) => porId.get(id)?.vistaClave ?? null);
}
