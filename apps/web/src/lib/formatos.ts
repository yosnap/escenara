import { ZONA_SEGURA } from "./voz";

/**
 * **Formatos de salida** de un proyecto y de su montaje, tal como los comparten el servidor y el navegador.
 *
 * Un formato es una proporción con su resolución de exportación, su nombre de plataforma y su zona segura. Aquí no
 * hay ninguna orden de FFmpeg ni ninguna lectura: solo datos y funciones puras.
 *
 * Tres reglas viven en este fichero porque tienen que decir lo mismo en las dos orillas:
 *
 * - **el formato principal decide la proporción que se le pide al modelo** al generar; los demás se sacan del
 *   mismo clip con reencuadre, sin volver a generar nada y sin coste de proveedor;
 * - **9:16 sigue exactamente igual que antes**: su encuadre automático es el de siempre (escalar sin deformar y
 *   rellenar con negro), así que un montaje vertical anterior se exporta con los mismos argumentos;
 * - **reencuadrar nunca es silencioso**: si el recorte deja fuera más de la mitad del plano, se avisa.
 */

/** Formatos de exportación. El orden es el de las pestañas del montaje y el del selector por plataforma. */
export const FORMATOS_MONTAJE = ["vertical_9_16", "vertical_4_5", "cuadrado_1_1", "horizontal_16_9"] as const;
export type FormatoMontaje = (typeof FORMATOS_MONTAJE)[number];

export const esFormatoMontaje = (v: unknown): v is FormatoMontaje => FORMATOS_MONTAJE.includes(v as FormatoMontaje);

export const FORMATO_MONTAJE_POR_DEFECTO: FormatoMontaje = "vertical_9_16";

/** Proporción que se le pide al modelo para cada formato, con la grafía del catálogo («9:16»…). */
export const PROPORCION_DE_FORMATO: Record<FormatoMontaje, string> = {
  vertical_9_16: "9:16",
  vertical_4_5: "4:5",
  cuadrado_1_1: "1:1",
  horizontal_16_9: "16:9",
};

/** Formato de una proporción del catálogo, o `null` si no es ninguno de los que exporta Escenara. */
export const formatoDeProporcion = (proporcion: string): FormatoMontaje | null =>
  FORMATOS_MONTAJE.find((f) => PROPORCION_DE_FORMATO[f] === proporcion) ?? null;

/** Resolución de exportación. El lado corto es siempre 1080 px, que es lo que piden las plataformas. */
export const RESOLUCION_MONTAJE: Record<FormatoMontaje, { ancho: number; alto: number }> = {
  vertical_9_16: { ancho: 1080, alto: 1920 },
  vertical_4_5: { ancho: 1080, alto: 1350 },
  cuadrado_1_1: { ancho: 1080, alto: 1080 },
  horizontal_16_9: { ancho: 1920, alto: 1080 },
};

/**
 * Para qué es la pieza, con el nombre de la plataforma y la proporción (petición del propietario, 2026-09-27). Es
 * lo que se lee en el selector: la gente sabe dónde va a publicar antes que qué proporción necesita.
 */
export const PLATAFORMA_DE_FORMATO: Record<FormatoMontaje, string> = {
  vertical_9_16: "Reels · TikTok · Stories (9:16)",
  vertical_4_5: "Instagram feed y carrusel (4:5)",
  cuadrado_1_1: "Cuadrado (1:1)",
  horizontal_16_9: "YouTube · horizontal (16:9)",
};

/** Nombre de pestaña: la proporción y la plataforma más típica, para que quepan cuatro en una fila. */
export const PESTANA_DE_FORMATO: Record<FormatoMontaje, string> = {
  vertical_9_16: "9:16 · Reels",
  vertical_4_5: "4:5 · Feed",
  cuadrado_1_1: "1:1",
  horizontal_16_9: "16:9 · YouTube",
};

/** Nombre con la resolución, para el resumen de una exportación. */
export const ETIQUETA_FORMATO_MONTAJE: Record<FormatoMontaje, string> = {
  vertical_9_16: "Vertical 1080 × 1920 (9:16)",
  vertical_4_5: "Vertical 1080 × 1350 (4:5)",
  cuadrado_1_1: "Cuadrado 1080 × 1080 (1:1)",
  horizontal_16_9: "Horizontal 1920 × 1080 (16:9)",
};

/**
 * Formatos que admite un clip de vídeo. 4:5 es de imagen y carrusel: las plataformas lo aceptan en vídeo, pero
 * ningún modelo de vídeo del catálogo lo genera, así que un clip se pide en uno de estos tres y el 4:5 se saca en
 * el montaje con reencuadre.
 */
export const FORMATOS_DE_VIDEO: readonly FormatoMontaje[] = ["vertical_9_16", "cuadrado_1_1", "horizontal_16_9"];

// ── Zona segura ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Franja de arriba y de abajo que tapa la interfaz de cada plataforma, en % del alto. Son **aproximaciones
 * documentadas** (medidas el 2026-09-27 para el vertical; feed y YouTube, el 2026-09-30 sobre capturas de cada
 * aplicación), no una garantía: cada aplicación cambia su interfaz cuando quiere.
 *
 * El vertical 9:16 conserva los valores de siempre (`lib/voz.ts › ZONA_SEGURA`): sus subtítulos y su etiqueta
 * caen exactamente donde caían.
 */
export const ZONA_SEGURA_DE_FORMATO: Record<FormatoMontaje, { arribaPorCiento: number; abajoPorCiento: number }> = {
  vertical_9_16: { arribaPorCiento: ZONA_SEGURA.arribaPorCiento, abajoPorCiento: ZONA_SEGURA.abajoPorCiento },
  // Feed de Instagram: arriba nada tapa la imagen, abajo los iconos y el pie; se deja un margen de lectura.
  vertical_4_5: { arribaPorCiento: 6, abajoPorCiento: 12 },
  cuadrado_1_1: { arribaPorCiento: 6, abajoPorCiento: 12 },
  // YouTube: el título arriba al pasar el ratón y la barra de reproducción abajo.
  horizontal_16_9: { arribaPorCiento: 8, abajoPorCiento: 14 },
};

// ── Formatos de un proyecto ─────────────────────────────────────────────────────────────────────────────────

/** Lista de formatos de un proyecto: el primero es el **principal**, el que se genera. Sin repetidos. */
export type FormatosDelProyecto = FormatoMontaje[];

export const FORMATOS_DEL_PROYECTO_POR_DEFECTO: FormatosDelProyecto = [FORMATO_MONTAJE_POR_DEFECTO];

/**
 * Lee la lista de formatos de un proyecto tal como llega (de la base de datos o de una petición). Devuelve `null`
 * si no sirve: vacía, con repetidos, con un formato desconocido o con más de los que hay.
 */
export function formatosValidos(valor: unknown): FormatosDelProyecto | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > FORMATOS_MONTAJE.length) return null;
  if (!valor.every(esFormatoMontaje)) return null;
  return new Set(valor).size === valor.length ? [...valor] : null;
}

/** Formatos guardados de un proyecto, con el vertical de siempre si la columna trae algo ilegible. */
export const formatosDe = (guardados: unknown): FormatosDelProyecto =>
  formatosValidos(guardados) ?? [...FORMATOS_DEL_PROYECTO_POR_DEFECTO];

export const formatoPrincipal = (formatos: readonly FormatoMontaje[]): FormatoMontaje =>
  formatos[0] ?? FORMATO_MONTAJE_POR_DEFECTO;

// ── Encuadre por escena y formato ───────────────────────────────────────────────────────────────────────────

/**
 * Cómo entra un clip en un formato que no es el suyo:
 *
 * - `recorte`: se escala hasta **llenar** el formato y se recorta lo que sobra. `x` e `y` (0–100) dicen qué parte
 *   se queda: 0 es el borde izquierdo o de arriba, 50 el centro y 100 el borde derecho o de abajo;
 * - `bandas`: se escala hasta **caber** entero y se rellena con negro. Es lo que hacía siempre el vertical.
 */
export type Encuadre = { modo: "recorte"; x: number; y: number } | { modo: "bandas" };

/** Encuadres guardados de un montaje: por formato y, dentro, por escena. Lo que falta es «automático». */
export type EncuadresDelMontaje = Partial<Record<FormatoMontaje, Record<string, Encuadre>>>;

export const ENCUADRE_CENTRADO: Encuadre = { modo: "recorte", x: 50, y: 50 };

/** Atajos del ajuste de encuadre, en el orden en que se ofrecen. */
export const PRESETS_ENCUADRE = [
  { clave: "centrado", etiqueta: "Centrado", encuadre: ENCUADRE_CENTRADO },
  { clave: "izquierda", etiqueta: "Izquierda", encuadre: { modo: "recorte", x: 0, y: 50 } },
  { clave: "derecha", etiqueta: "Derecha", encuadre: { modo: "recorte", x: 100, y: 50 } },
  { clave: "arriba", etiqueta: "Arriba", encuadre: { modo: "recorte", x: 50, y: 0 } },
  { clave: "abajo", etiqueta: "Abajo", encuadre: { modo: "recorte", x: 50, y: 100 } },
  { clave: "bandas", etiqueta: "Entero, con bandas", encuadre: { modo: "bandas" } },
] as const satisfies readonly { clave: string; etiqueta: string; encuadre: Encuadre }[];

/**
 * Encuadre **automático** de un formato: el vertical, el de siempre (entero con bandas, que para un clip vertical
 * es idéntico a no tocarlo); los demás, recorte centrado.
 */
export const encuadreAutomatico = (formato: FormatoMontaje): Encuadre =>
  formato === "vertical_9_16" ? { modo: "bandas" } : ENCUADRE_CENTRADO;

/** El encuadre con el que se monta una escena en un formato: el guardado o, si no hay, el automático. */
export const encuadreDe = (encuadres: EncuadresDelMontaje, formato: FormatoMontaje, escenaId: string): Encuadre =>
  encuadres[formato]?.[escenaId] ?? encuadreAutomatico(formato);

const posicion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;

/** Lee un encuadre que llega de fuera. `null` si no sirve. */
export function encuadreValido(valor: unknown): Encuadre | null {
  if (typeof valor !== "object" || valor === null) return null;
  const v = valor as Record<string, unknown>;
  if (v.modo === "bandas") return { modo: "bandas" };
  if (v.modo === "recorte" && posicion(v.x) && posicion(v.y)) return { modo: "recorte", x: v.x, y: v.y };
  return null;
}

/** Iguales si dicen lo mismo: sirve para no guardar como «ajustado» lo que ya es el automático. */
export const mismoEncuadre = (a: Encuadre, b: Encuadre): boolean =>
  a.modo === b.modo && (a.modo === "bandas" || (b.modo === "recorte" && a.x === b.x && a.y === b.y));

/**
 * Qué fracción del plano original **se queda** al recortar un clip de `ancho × alto` para un formato (0–1). Un
 * vertical 9:16 llevado a 16:9 conserva el 32 %: es lo que hay que avisar antes de exportar.
 */
export function planoConservado(ancho: number, alto: number, formato: FormatoMontaje): number {
  if (!(ancho > 0) || !(alto > 0)) return 1;
  const { ancho: aw, alto: ah } = RESOLUCION_MONTAJE[formato];
  const origen = ancho / alto;
  const destino = aw / ah;
  return Math.min(origen / destino, destino / origen);
}

/** Por debajo de esta fracción conservada se avisa de que el recorte pierde demasiado plano. */
export const PLANO_CONSERVADO_MINIMO = 0.5;

/**
 * Aviso de un recorte que pierde demasiado plano, o `null`. Solo aplica al modo `recorte`: con bandas no se pierde
 * nada del plano (se ve más pequeño).
 */
export function avisoDeRecorte(
  encuadre: Encuadre,
  medidas: { ancho: number | null; alto: number | null },
  formato: FormatoMontaje,
): string | null {
  if (encuadre.modo !== "recorte" || medidas.ancho === null || medidas.alto === null) return null;
  const conservado = planoConservado(medidas.ancho, medidas.alto, formato);
  if (conservado >= PLANO_CONSERVADO_MINIMO) return null;
  return `El recorte a ${PROPORCION_DE_FORMATO[formato]} deja fuera el ${Math.round((1 - conservado) * 100)} % del plano. Mueve el encuadre hacia lo importante o elige «Entero, con bandas».`;
}

// ── Formatos que se pueden generar con los modelos elegidos ─────────────────────────────────────────────────

/** Lo que hace falta de un modelo para saber si genera en un formato: su nombre y sus proporciones del catálogo. */
export interface ModeloConProporciones {
  nombre: string;
  proporciones: readonly string[];
}

/**
 * Por qué no se puede **generar** en un formato con estos modelos, o `null` si se puede. Es la misma regla que la
 * botonera de presets (`lib/presets.ts › motivoIncompatible`): un modelo que no declara la proporción en el
 * catálogo no la admite, y **lo que no se admite no se ofrece ni se envía**.
 *
 * El vertical 9:16 no se comprueba: es lo que se ha generado siempre, y un proyecto de antes no puede quedarse sin
 * producir por esta versión.
 */
export function motivoFormatoNoGenerable(
  formato: FormatoMontaje,
  modelos: readonly ModeloConProporciones[],
): string | null {
  if (formato === FORMATO_MONTAJE_POR_DEFECTO) return null;
  const proporcion = PROPORCION_DE_FORMATO[formato];
  const motivos = modelos
    .filter((m) => !m.proporciones.includes(proporcion))
    .map((m) =>
      m.proporciones.length === 0
        ? `${m.nombre} no admite elegir proporción`
        : `${m.nombre} solo admite ${m.proporciones.join(", ")}`,
    );
  if (motivos.length === 0) return null;
  return `${motivos.join("; ")}. Con los modelos que tienes elegidos no se puede generar en ${proporcion}: elige otro formato principal o cambia de modelo. Los demás formatos se pueden seguir sacando en el montaje con reencuadre.`;
}

/** Por formato, por qué no se puede generar en él con estos modelos; `null` si se puede. */
export const formatosGenerables = (modelos: readonly ModeloConProporciones[]): Record<FormatoMontaje, string | null> =>
  Object.fromEntries(FORMATOS_MONTAJE.map((f) => [f, motivoFormatoNoGenerable(f, modelos)])) as Record<
    FormatoMontaje,
    string | null
  >;

/**
 * Proporción que un proyecto **fija** al generar sus escenas: la de su formato principal. `undefined` en vertical
 * 9:16, que es lo que se generaba antes de poder elegir: entonces no se fija nada y todo sale exactamente igual.
 */
export function proporcionFijadaDelProyecto(formatosGuardados: unknown): string | undefined {
  const principal = formatoPrincipal(formatosDe(formatosGuardados));
  return principal === FORMATO_MONTAJE_POR_DEFECTO ? undefined : PROPORCION_DE_FORMATO[principal];
}

// ── Un fotograma y el modelo de vídeo que lo va a animar ────────────────────────────────────────────────────

/** Tolerancia al comparar las medidas de una imagen con una proporción: el redondeo de los codificadores. */
const TOLERANCIA_PROPORCION = 0.02;

const valorDeProporcion = (proporcion: string): number | null => {
  const [a, b] = proporcion.split(":").map(Number);
  return a && b ? a / b : null;
};

/** `true` si una imagen de `ancho × alto` está en esa proporción, con la tolerancia del redondeo. */
export function medidasEnProporcion(ancho: number, alto: number, proporcion: string): boolean {
  const valor = valorDeProporcion(proporcion);
  if (valor === null || !(ancho > 0) || !(alto > 0)) return false;
  return Math.abs(ancho / alto - valor) / valor <= TOLERANCIA_PROPORCION;
}

/**
 * ¿Puede este modelo de vídeo animar una imagen de estas medidas sin que Escenara la recorte? Sí si no acepta
 * proporción (toma la de la imagen), si no se conocen las medidas, o si alguna de las suyas coincide.
 */
export function animaEstasMedidas(
  proporcionesDelModelo: readonly string[],
  medidas: { ancho: number | null; alto: number | null },
): boolean {
  if (proporcionesDelModelo.length === 0 || medidas.ancho === null || medidas.alto === null) return true;
  return proporcionesDelModelo.some((p) => medidasEnProporcion(medidas.ancho as number, medidas.alto as number, p));
}

/**
 * Nombre del MP4 exportado en la biblioteca y en la descarga. El vertical conserva el de siempre («montaje.mp4»,
 * que se descarga como «escenara-montaje.mp4»); los demás llevan su proporción para distinguirlos.
 */
export const nombreDeExportacion = (formato: FormatoMontaje): string =>
  formato === FORMATO_MONTAJE_POR_DEFECTO
    ? "montaje.mp4"
    : `montaje-${PROPORCION_DE_FORMATO[formato].replace(":", "x")}.mp4`;
