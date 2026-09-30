/**
 * **Esquema del documento de marca** (RF15): el mismo que `docs/branding/escenara.brand.json`, validado campo a campo
 * y con listas estrictas antes de guardar un borrador o publicar.
 *
 * Todo lo que acaba en CSS (colores, familias tipográficas, medidas) solo puede tener la forma exacta que se espera:
 * un color es `#RRGGBB` y nada más, una familia es una lista de nombres de letras, números y guiones, una medida es un
 * entero dentro de su rango. Así un token no puede cerrar la regla, abrir otra, cargar una URL ni colar HTML. Las
 * claves también son fijas: `generarCss` convierte cada clave en el nombre de una variable, así que una clave
 * inventada sería una vía de inyección y aquí se rechaza.
 *
 * Los textos de marca no van nunca a CSS; se escapan al pintarse (React y los metadatos de Next) y además aquí se
 * rechazan los caracteres de control y `<`/`>`, que ningún nombre ni lema necesita.
 *
 * Se comparte con el navegador: el editor enseña los mismos errores por campo que devolvería el servidor.
 */

export const CLAVES_TEMA = [
  "background",
  "surface",
  "surfaceRaised",
  "text",
  "textMuted",
  "border",
  "primary",
  "onPrimary",
  "focus",
  "brandSpark",
  "creative",
  "success",
  "warning",
  "danger",
] as const;
export type ClaveTema = (typeof CLAVES_TEMA)[number];

export const CLAVES_VIBRANTES = ["cobalt", "coral", "tangerine", "sun", "fuchsia", "cyan"] as const;
export type ClaveVibrante = (typeof CLAVES_VIBRANTES)[number];

export const NOMBRES_DEGRADADO = ["foco", "chispa", "escenario", "atardecer"] as const;
export type NombreDegradado = (typeof NOMBRES_DEGRADADO)[number];

export const MODOS_MARCA = ["light", "dark"] as const;
export type ModoMarca = (typeof MODOS_MARCA)[number];

const ELECCIONES_TEMA = ["system", "light", "dark"] as const;
const ESCALAS = ["display", "h1", "h2", "h3", "body", "compact", "label"] as const;
const IDIOMAS = ["es", "en"] as const;

export type TemaMarca = Record<ClaveTema, string>;
export type VibrantesMarca = Record<ClaveVibrante, string>;
export type TextosMarca = Record<(typeof IDIOMAS)[number], string>;

export interface DocumentoMarca {
  schemaVersion: 1;
  brandVersion: string;
  identity: {
    name: string;
    slug: string;
    descriptor: TextosMarca;
    tagline: TextosMarca;
    productLine: TextosMarca;
  };
  theme: {
    default: (typeof ELECCIONES_TEMA)[number];
    choices: (typeof ELECCIONES_TEMA)[number][];
    light: TemaMarca;
    dark: TemaMarca;
  };
  vibrant: { light: VibrantesMarca; dark: VibrantesMarca };
  gradients: Record<NombreDegradado, ClaveVibrante[]>;
  typography: {
    family: string;
    mono: string;
    weights: number[];
    scalePx: Record<(typeof ESCALAS)[number], [number, number]>;
  };
  layout: {
    gridPx: number;
    mobileMarginPx: number;
    desktopMarginPx: number;
    controlRadiusPx: number;
    cardRadiusPx: number;
    minimumTouchTargetPx: number;
  };
  motion: {
    interactionMs: [number, number];
    transitionMs: [number, number];
    celebrationMs: [number, number];
    themeMs: number;
    respectReducedMotion: boolean;
  };
}

export interface ErrorCampo {
  /** Ruta del campo en el documento, con puntos: `theme.dark.text`. */
  campo: string;
  mensaje: string;
}

export type ResultadoDocumento = { ok: true; documento: DocumentoMarca } | { ok: false; errores: ErrorCampo[] };

// ── Listas estrictas ────────────────────────────────────────────────────────────────────────────────────────

/** Único formato de color admitido: `#RRGGBB`. Sin nombres, sin `rgb()`, sin `var()`, sin nada que se pueda cerrar. */
export const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Un nombre de familia: de una a cinco palabras que empiezan por letra, con letras, números y guiones. Sin comillas,
 * barras, puntos y comas ni llaves. Cada palabra es un identificador de CSS válido, así que se escribe sin comillas.
 */
export const NOMBRE_FUENTE = /^[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*){0,4}$/;

/** Familias genéricas de CSS que se admiten al final de la lista. */
const GENERICAS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
]);

/** Palabras clave globales de CSS: en una lista de familias no son válidas y la dejarían sin efecto. */
const PALABRAS_GLOBALES = new Set(["inherit", "initial", "unset", "revert", "revert-layer", "default"]);

const MAX_FAMILIAS = 8;
const MAX_LARGO_FAMILIA = 40;
const VERSION_MARCA = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/**
 * Caracteres de control (saltos de línea incluidos), de formato invisibles (marcas de dirección como U+202E, espacios
 * de anchura cero), separadores de línea y párrafo, y los signos `<` y `>`: ningún texto de marca los necesita, y los
 * invisibles permiten que un nombre se lea distinto de lo que es.
 */
export const CONTROL_O_ETIQUETA = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u;

/** ¿Es una lista de familias segura? Devuelve el motivo del rechazo o `null`. */
export function motivoFamiliaNoValida(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.trim() === "") return "Escribe al menos una familia tipográfica.";
  const partes = valor.split(",").map((p) => p.trim());
  if (partes.length > MAX_FAMILIAS) return `Como mucho ${MAX_FAMILIAS} familias en la lista.`;
  for (const parte of partes) {
    if (parte === "") return "Hay una coma de más en la lista de familias.";
    if (GENERICAS.has(parte)) continue;
    if (PALABRAS_GLOBALES.has(parte.toLowerCase())) {
      return `«${parte}» es una palabra reservada de CSS, no una familia: quítala de la lista.`;
    }
    if (parte.length > MAX_LARGO_FAMILIA || !NOMBRE_FUENTE.test(parte)) {
      return `«${parte.slice(0, MAX_LARGO_FAMILIA)}» no es un nombre de familia admitido: solo letras, números, guiones y espacios, empezando por letra y sin comillas.`;
    }
  }
  return null;
}

/** Nombre de una familia que se sube (una sola, sin genéricas). Devuelve el motivo del rechazo o `null`. */
export function motivoNombreFuenteNoValido(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.trim() === "") return "Escribe el nombre de la familia.";
  const limpio = valor.trim();
  if (GENERICAS.has(limpio) || PALABRAS_GLOBALES.has(limpio.toLowerCase())) {
    return "Ese nombre es de una familia genérica o una palabra reservada de CSS: elige otro.";
  }
  if (limpio.length > MAX_LARGO_FAMILIA || !NOMBRE_FUENTE.test(limpio)) {
    return "El nombre solo admite letras, números, guiones y espacios, empezando por letra y sin comillas.";
  }
  return null;
}

// ── Validación ──────────────────────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

/** Claves permitidas de un objeto: avisa de las que sobran y de las que faltan. */
function claves(
  valor: Objeto | null,
  ruta: string,
  esperadas: readonly string[],
  errores: ErrorCampo[],
  opcionales: readonly string[] = [],
) {
  // Un bloque que no es un objeto ya tiene su error: no se repite campo por campo.
  if (valor === null) return;
  const permitidas = new Set<string>([...esperadas, ...opcionales]);
  for (const clave of Object.keys(valor)) {
    if (!permitidas.has(clave))
      errores.push({ campo: unir(ruta, clave), mensaje: "Este campo no existe en el esquema." });
  }
  for (const clave of esperadas) {
    if (!(clave in valor)) errores.push({ campo: unir(ruta, clave), mensaje: "Falta este campo." });
  }
}

const unir = (ruta: string, clave: string) => (ruta === "" ? clave : `${ruta}.${clave}`);

function objeto(valor: unknown, ruta: string, errores: ErrorCampo[]): Objeto | null {
  if (esObjeto(valor)) return valor;
  errores.push({ campo: ruta, mensaje: "Tiene que ser un objeto." });
  return null;
}

/**
 * Un bloque del documento con sus claves comprobadas. Si falta, su ausencia ya la dice quien lo contiene; si no es un
 * objeto, se dice una vez. En los dos casos se sigue con un objeto vacío para recoger el resto de errores de golpe.
 */
function bloque(padre: Objeto, clave: string, esperadas: readonly string[], errores: ErrorCampo[], ruta = ""): Objeto {
  const valor = padre[clave];
  if (valor === undefined) return {};
  const o = objeto(valor, unir(ruta, clave), errores);
  claves(o, unir(ruta, clave), esperadas, errores);
  return o ?? {};
}

function color(valor: unknown, ruta: string, errores: ErrorCampo[]): string {
  if (typeof valor === "string" && COLOR_HEX.test(valor)) return valor.toUpperCase();
  errores.push({ campo: ruta, mensaje: "Tiene que ser un color hexadecimal de seis cifras, como #2753D7." });
  return "#000000";
}

function entero(valor: unknown, ruta: string, min: number, max: number, errores: ErrorCampo[]): number {
  if (typeof valor === "number" && Number.isInteger(valor) && valor >= min && valor <= max) return valor;
  errores.push({ campo: ruta, mensaje: `Tiene que ser un número entero entre ${min} y ${max}.` });
  return min;
}

function par(valor: unknown, ruta: string, min: number, max: number, errores: ErrorCampo[]): [number, number] {
  if (!Array.isArray(valor) || valor.length !== 2) {
    errores.push({ campo: ruta, mensaje: "Tiene que ser una pareja de números [mínimo, máximo]." });
    return [min, min];
  }
  const a = entero(valor[0], `${ruta}.0`, min, max, errores);
  const b = entero(valor[1], `${ruta}.1`, min, max, errores);
  if (a > b) errores.push({ campo: ruta, mensaje: "El primer número no puede ser mayor que el segundo." });
  return [a, b];
}

function texto(valor: unknown, ruta: string, max: number, errores: ErrorCampo[]): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    errores.push({ campo: ruta, mensaje: "Escribe un texto." });
    return "";
  }
  const limpio = valor.trim();
  if (limpio.length > max) errores.push({ campo: ruta, mensaje: `Como mucho ${max} caracteres.` });
  else if (CONTROL_O_ETIQUETA.test(limpio)) {
    errores.push({ campo: ruta, mensaje: "No admite saltos de línea, caracteres de control ni los signos < y >." });
  }
  return limpio;
}

function textos(valor: unknown, ruta: string, max: number, errores: ErrorCampo[]): TextosMarca {
  if (valor === undefined) return { es: "", en: "" };
  const o = objeto(valor, ruta, errores);
  if (!o) return { es: "", en: "" };
  claves(o, ruta, IDIOMAS, errores);
  return { es: texto(o.es, `${ruta}.es`, max, errores), en: texto(o.en, `${ruta}.en`, max, errores) };
}

function mapaDeColores<K extends string>(valor: unknown, ruta: string, lista: readonly K[], errores: ErrorCampo[]) {
  const resultado = {} as Record<K, string>;
  const o = valor === undefined ? null : objeto(valor, ruta, errores);
  claves(o, ruta, lista, errores);
  for (const clave of lista) {
    // Sin bloque, su ausencia ya está dicha arriba: no se repite color por color.
    resultado[clave] = o ? color(o[clave], unir(ruta, clave), errores) : "#000000";
  }
  return resultado;
}

function familia(valor: unknown, ruta: string, errores: ErrorCampo[]): string {
  const motivo = motivoFamiliaNoValida(valor);
  if (motivo) {
    errores.push({ campo: ruta, mensaje: motivo });
    return "sans-serif";
  }
  return (valor as string)
    .split(",")
    .map((p) => p.trim())
    .join(", ");
}

/**
 * Valida un documento de marca completo. Acepta también el `escenara.brand.json` de referencia tal cual: sus bloques
 * `logo` y `validation` describen ficheros del repositorio y umbrales fijos, así que se admiten y **no se guardan**
 * (los logotipos de la instalación son los que se suben y los umbrales de contraste no se pueden rebajar).
 */
export function validarDocumentoMarca(entrada: unknown): ResultadoDocumento {
  const errores: ErrorCampo[] = [];
  const raiz = objeto(entrada, "documento", errores);
  if (!raiz) return { ok: false, errores };
  claves(
    raiz,
    "",
    ["schemaVersion", "brandVersion", "identity", "theme", "vibrant", "gradients", "typography", "layout", "motion"],
    errores,
    ["logo", "validation"],
  );
  if (raiz.schemaVersion !== 1) errores.push({ campo: "schemaVersion", mensaje: "La única versión del esquema es 1." });
  const brandVersion = typeof raiz.brandVersion === "string" ? raiz.brandVersion : "";
  if (!VERSION_MARCA.test(brandVersion)) {
    errores.push({ campo: "brandVersion", mensaje: "Tiene que ser una versión como 1.0.0." });
  }

  const id = bloque(raiz, "identity", ["name", "slug", "descriptor", "tagline", "productLine"], errores);
  const slug = typeof id.slug === "string" ? id.slug : "";
  if (!SLUG.test(slug)) {
    errores.push({ campo: "identity.slug", mensaje: "Solo minúsculas, números y guiones, hasta 40 caracteres." });
  }

  const tema = bloque(raiz, "theme", ["default", "choices", "light", "dark"], errores);
  const porDefecto = ELECCIONES_TEMA.find((e) => e === tema.default);
  if (!porDefecto) errores.push({ campo: "theme.default", mensaje: "Tiene que ser system, light o dark." });
  const elecciones = Array.isArray(tema.choices) ? tema.choices : [];
  if (elecciones.length !== ELECCIONES_TEMA.length || !ELECCIONES_TEMA.every((e) => elecciones.includes(e))) {
    errores.push({ campo: "theme.choices", mensaje: "Tienen que ser exactamente system, light y dark." });
  }

  const vibrante = bloque(raiz, "vibrant", MODOS_MARCA, errores);

  const degradados = bloque(raiz, "gradients", NOMBRES_DEGRADADO, errores);
  const gradients = {} as Record<NombreDegradado, ClaveVibrante[]>;
  for (const nombre of NOMBRES_DEGRADADO) {
    const paradas = degradados[nombre];
    const validas =
      Array.isArray(paradas) &&
      paradas.length >= 2 &&
      paradas.length <= 4 &&
      paradas.every((p) => CLAVES_VIBRANTES.includes(p as ClaveVibrante));
    if (!validas) {
      errores.push({
        campo: `gradients.${nombre}`,
        mensaje: `Entre 2 y 4 colores vibrantes de la lista: ${CLAVES_VIBRANTES.join(", ")}.`,
      });
    }
    gradients[nombre] = validas ? (paradas as ClaveVibrante[]) : ["cobalt", "cyan"];
  }

  const tipo = bloque(raiz, "typography", ["family", "mono", "weights", "scalePx"], errores);
  const pesos = Array.isArray(tipo.weights) ? tipo.weights : [];
  const pesosValidos =
    pesos.length >= 1 &&
    pesos.length <= 9 &&
    new Set(pesos).size === pesos.length &&
    pesos.every((p) => typeof p === "number" && Number.isInteger(p) && p >= 100 && p <= 900 && p % 100 === 0);
  if (!pesosValidos) {
    errores.push({
      campo: "typography.weights",
      mensaje: "Entre 1 y 9 pesos distintos, de 100 a 900 de cien en cien.",
    });
  }
  const escala = bloque(tipo, "scalePx", ESCALAS, errores, "typography");
  const scalePx = {} as DocumentoMarca["typography"]["scalePx"];
  for (const nombre of ESCALAS) scalePx[nombre] = par(escala[nombre], `typography.scalePx.${nombre}`, 10, 120, errores);

  const capa = bloque(
    raiz,
    "layout",
    ["gridPx", "mobileMarginPx", "desktopMarginPx", "controlRadiusPx", "cardRadiusPx", "minimumTouchTargetPx"],
    errores,
  );
  const mov = bloque(
    raiz,
    "motion",
    ["interactionMs", "transitionMs", "celebrationMs", "themeMs", "respectReducedMotion"],
    errores,
  );
  if (mov.respectReducedMotion !== true) {
    errores.push({
      campo: "motion.respectReducedMotion",
      mensaje: "Tiene que ser true: respetar «reducir movimiento» no es opcional.",
    });
  }

  const documento: DocumentoMarca = {
    schemaVersion: 1,
    brandVersion,
    identity: {
      name: texto(id.name, "identity.name", 40, errores),
      slug,
      descriptor: textos(id.descriptor, "identity.descriptor", 120, errores),
      tagline: textos(id.tagline, "identity.tagline", 80, errores),
      productLine: textos(id.productLine, "identity.productLine", 80, errores),
    },
    theme: {
      default: porDefecto ?? "system",
      choices: [...ELECCIONES_TEMA],
      light: mapaDeColores(tema.light, "theme.light", CLAVES_TEMA, errores),
      dark: mapaDeColores(tema.dark, "theme.dark", CLAVES_TEMA, errores),
    },
    vibrant: {
      light: mapaDeColores(vibrante.light, "vibrant.light", CLAVES_VIBRANTES, errores),
      dark: mapaDeColores(vibrante.dark, "vibrant.dark", CLAVES_VIBRANTES, errores),
    },
    gradients,
    typography: {
      family: familia(tipo.family, "typography.family", errores),
      mono: familia(tipo.mono, "typography.mono", errores),
      weights: pesosValidos ? (pesos as number[]) : [400],
      scalePx,
    },
    layout: {
      gridPx: entero(capa.gridPx, "layout.gridPx", 4, 16, errores),
      mobileMarginPx: entero(capa.mobileMarginPx, "layout.mobileMarginPx", 0, 64, errores),
      desktopMarginPx: entero(capa.desktopMarginPx, "layout.desktopMarginPx", 0, 96, errores),
      controlRadiusPx: entero(capa.controlRadiusPx, "layout.controlRadiusPx", 0, 40, errores),
      cardRadiusPx: entero(capa.cardRadiusPx, "layout.cardRadiusPx", 0, 48, errores),
      // 44 px es el mínimo de accesibilidad del objetivo táctil: la marca no puede bajarlo.
      minimumTouchTargetPx: entero(capa.minimumTouchTargetPx, "layout.minimumTouchTargetPx", 44, 64, errores),
    },
    motion: {
      interactionMs: par(mov.interactionMs, "motion.interactionMs", 0, 2000, errores),
      transitionMs: par(mov.transitionMs, "motion.transitionMs", 0, 2000, errores),
      celebrationMs: par(mov.celebrationMs, "motion.celebrationMs", 0, 4000, errores),
      themeMs: entero(mov.themeMs, "motion.themeMs", 0, 1000, errores),
      respectReducedMotion: true,
    },
  };
  if (errores.length === 0) return { ok: true, documento };
  // Un campo que falta también es un color o un número no válido: se dice una vez por campo, lo primero que falló.
  const vistos = new Set<string>();
  return { ok: false, errores: errores.filter((e) => !vistos.has(e.campo) && Boolean(vistos.add(e.campo))) };
}
