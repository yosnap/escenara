import type { Proveedor } from "./boveda";
import type { EvaluacionVista } from "./controles";
import type { Medio } from "./media/tipos";

/**
 * Voz, subtítulos y música de un proyecto (RF08, 0.21.0). Lo que comparten el servidor y el navegador: aquí no
 * hay secretos ni nada que dependa de una credencial.
 *
 * **La voz se elige por proyecto, no por escena** (decisión firme del propietario, 2026-09-28). Hay dos modos y
 * son excluyentes:
 *
 * - `clip`: la voz la genera el propio modelo de vídeo, que anima al personaje diciendo el diálogo de la escena
 *   con los labios sincronizados. Es lo que hace la producción desde la 0.19.0. **No hay pista TTS**, y los
 *   subtítulos salen de transcribir el audio del clip;
 * - `pista`: los clips se piden **sin diálogo** (solo sonido ambiente) y el diálogo se genera aparte como audio
 *   TTS, escena a escena, siempre con **la misma voz y los mismos parámetros** fijados en el proyecto. Los
 *   subtítulos salen del texto del diálogo y se ajustan con los tiempos del audio.
 *
 * Cambiar de modo, de voz o de parámetros **invalida** lo que dependía de ello y dice qué costaría regenerarlo.
 * Nada se regenera sin que el usuario confirme ese coste.
 */

export const MODOS_VOZ = ["clip", "pista"] as const;
export type ModoVoz = (typeof MODOS_VOZ)[number];

export const esModoVoz = (v: unknown): v is ModoVoz => MODOS_VOZ.includes(v as ModoVoz);

/** El modo de un proyecto nuevo: la voz del clip, que es lo que ya funciona y no añade ningún gasto nuevo. */
export const MODO_VOZ_POR_DEFECTO: ModoVoz = "clip";

export const ETIQUETA_MODO_VOZ: Record<ModoVoz, string> = {
  clip: "Voz del clip",
  pista: "Pista de voz aparte",
};

export const DESCRIPCION_MODO_VOZ: Record<ModoVoz, string> = {
  clip: "El modelo de vídeo genera el clip con el personaje diciendo el diálogo y los labios sincronizados. No se genera ninguna pista de voz aparte y los subtítulos salen de transcribir el audio del clip.",
  pista:
    "Los clips se piden sin diálogo, solo con sonido ambiente, y el diálogo se genera como audio aparte con la misma voz en todas las escenas. Cuesta una llamada de voz por escena.",
};

/**
 * Parámetros de la voz. Son los del modelo de voz de ElevenLabs en el «market» de KIE (`stability`,
 * `similarity_boost`, `style`, `speed`), documentados en
 * https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2 (comprobado el 2026-09-28, sin llamar a
 * la API con ninguna clave).
 *
 * Quedan fijos para todo el proyecto: es lo que hace que el timbre no cambie entre escenas, que es el riesgo
 * que señaló el brainstorm §3.2.
 */
export interface ParametrosVoz {
  /** 0–1. Más alto, más constante; más bajo, más expresivo y más variable entre escenas. */
  estabilidad: number;
  /** 0–1. Cuánto se ceñirse al timbre de la voz elegida. */
  similitud: number;
  /** 0–1. Exageración del estilo. 0 es el más previsible. */
  estilo: number;
  /** 0,7–1,2. Velocidad del habla. */
  velocidad: number;
}

export const PARAMETROS_VOZ_POR_DEFECTO: ParametrosVoz = {
  estabilidad: 0.5,
  similitud: 0.75,
  estilo: 0,
  velocidad: 1,
};

/** Horquilla de cada parámetro, tal como la documenta el proveedor. Fuera de ella, la petición se rechaza. */
export const LIMITES_PARAMETROS_VOZ: Record<keyof ParametrosVoz, { min: number; max: number; paso: number }> = {
  estabilidad: { min: 0, max: 1, paso: 0.05 },
  similitud: { min: 0, max: 1, paso: 0.05 },
  estilo: { min: 0, max: 1, paso: 0.05 },
  velocidad: { min: 0.7, max: 1.2, paso: 0.05 },
};

export const ETIQUETA_PARAMETRO_VOZ: Record<keyof ParametrosVoz, string> = {
  estabilidad: "Estabilidad",
  similitud: "Fidelidad al timbre",
  estilo: "Estilo",
  velocidad: "Velocidad",
};

/** Redondea a dos decimales: los parámetros son mandos de la interfaz, no medidas. */
const dosDecimales = (n: number) => Math.round(n * 100) / 100;

/** `true` si el valor cabe en la horquilla documentada de ese parámetro. */
export function parametroVozValido(clave: keyof ParametrosVoz, valor: unknown): valor is number {
  const { min, max } = LIMITES_PARAMETROS_VOZ[clave];
  return typeof valor === "number" && Number.isFinite(valor) && valor >= min && valor <= max;
}

/**
 * Parámetros de voz a partir de lo que llega del navegador o de la base de datos. Lo que no se entiende se
 * sustituye por el valor por defecto: unos parámetros ilegibles no pueden convertirse en «cualquier voz vale».
 */
export function parametrosVozDe(crudo: unknown): ParametrosVoz {
  if (!crudo || typeof crudo !== "object") return { ...PARAMETROS_VOZ_POR_DEFECTO };
  const o = crudo as Record<string, unknown>;
  const claves = Object.keys(PARAMETROS_VOZ_POR_DEFECTO) as (keyof ParametrosVoz)[];
  const salida = { ...PARAMETROS_VOZ_POR_DEFECTO };
  for (const clave of claves) {
    if (parametroVozValido(clave, o[clave])) salida[clave] = dosDecimales(o[clave] as number);
  }
  return salida;
}

/**
 * Voz ofrecida en la interfaz.
 *
 * `id` es el **identificador de voz de ElevenLabs**, que es lo que espera el campo `voice` del modelo, y `nombre`
 * es lo único que se enseña. Se guarda el identificador y no el nombre **a propósito**: el `id` entra en
 * {@link firmaDeVoz}, se guarda en `projects.voice_id`, en `scenes.voice_signature` y en la clave única de las
 * muestras, así que cambiarlo después volvería a firmar todo de golpe: todas las escenas con voz quedarían
 * invalidadas y toda la caché de muestras dejaría de valer, y cada una se volvería a pagar. Un nombre es una
 * etiqueta y puede cambiar; el identificador es lo que identifica la voz.
 *
 * Los veintiún identificadores prediseñados de ElevenLabs se comprobaron contra su API el 2026-09-28; aquí se
 * ofrece un subconjunto con variedad de timbre y de género. **Quien valida el identificador es el proveedor**, no
 * esta lista. Sin clonación de voz en esta versión (decisión provisional del propietario, 2026-09-28).
 */
export interface VozOfrecida {
  id: string;
  nombre: string;
  descripcion: string;
}

export const VOCES_OFRECIDAS: readonly VozOfrecida[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", nombre: "Sarah", descripcion: "Femenina, tono neutro y narrativo." },
  { id: "Xb7hH8MSUJpSbSDYk0k2", nombre: "Alice", descripcion: "Femenina, clara y segura." },
  { id: "cgSgspJ2msm6clMCkdW9", nombre: "Jessica", descripcion: "Femenina, joven y expresiva." },
  { id: "XrExE9yKIg1WjnnlVkGX", nombre: "Matilda", descripcion: "Femenina, cercana y cálida." },
  { id: "pFZP5JQG7iQjIQuC4Bku", nombre: "Lily", descripcion: "Femenina, suave y pausada." },
  { id: "JBFqnCBsd6RMkjVDRZzb", nombre: "George", descripcion: "Masculina, grave y pausada." },
  { id: "pNInz6obpgDQGcFmaJgB", nombre: "Adam", descripcion: "Masculina, profunda y narrativa." },
  { id: "IKne3meq5aSn9XLyUdCD", nombre: "Charlie", descripcion: "Masculina, cercana y conversacional." },
  { id: "TX3LPaxmHKxFdv7VOQHJ", nombre: "Liam", descripcion: "Masculina, joven y enérgica." },
  { id: "nPczCjzI2devNBz1zQrb", nombre: "Brian", descripcion: "Masculina, seria y con autoridad." },
  { id: "SAz9YHcvj6GT2YYXdXww", nombre: "River", descripcion: "Neutra, serena y sin marcar género." },
];

export const esVozOfrecida = (v: unknown): v is string => VOCES_OFRECIDAS.some((voz) => voz.id === v);

export const nombreDeVoz = (id: string): string => VOCES_OFRECIDAS.find((v) => v.id === id)?.nombre ?? id;

/**
 * Voz fijada en el proyecto. `null` mientras no se haya elegido ninguna, que es el estado de un proyecto en modo
 * `clip`: ahí no hay pista de voz que configurar.
 */
export interface VozDelProyecto {
  proveedor: Proveedor;
  modelo: string;
  voz: string;
  parametros: ParametrosVoz;
  /** Cuándo se fijó. Es la fecha que explica por qué lo anterior quedó invalidado. */
  fijadaEn: string;
}

/**
 * Firma de lo que hace válida una pista de voz: el modo, el proveedor, el modelo, la voz, sus parámetros y el
 * **texto del diálogo** de la escena.
 *
 * Es lo que permite decir «este audio ya no corresponde a lo que pide el proyecto» sin guardar una bandera que
 * se desincronice: se compara la firma de ahora con la que se guardó al generarlo. Cambiar la voz, el modo, un
 * parámetro o el diálogo cambia la firma, y con ella la escena queda invalidada.
 */
export function firmaDeVoz(modo: ModoVoz, voz: VozDelProyecto | null, dialogo: string): string {
  if (modo === "clip" || !voz) return `clip:${dialogo.trim()}`;
  const p = voz.parametros;
  return [
    "pista",
    voz.proveedor,
    voz.modelo,
    voz.voz,
    p.estabilidad,
    p.similitud,
    p.estilo,
    p.velocidad,
    dialogo.trim(),
  ].join("|");
}

/** Texto máximo que acepta el modelo de voz por llamada (docs.kie.ai, 2026-09-28). */
export const DIALOGO_VOZ_MAXIMO = 5000;

// ── Subtítulos ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Línea de subtítulo con sus tiempos en segundos desde el principio de la escena. `texto` puede llevar saltos de
 * línea: son la **división de líneas** que decide quien edita, y se respetan tal cual al exportar.
 */
export interface Subtitulo {
  desde: number;
  hasta: number;
  texto: string;
}

/** Caracteres por línea que se consideran legibles en vertical. Por encima, el editor avisa. */
export const CARACTERES_POR_LINEA = 42;
/** Líneas por subtítulo que se consideran legibles. Tres tapan media pantalla. */
export const LINEAS_POR_SUBTITULO = 2;
/** Duración mínima legible de un subtítulo, en segundos. Por debajo, no se llega a leer. */
export const SEGUNDOS_MINIMOS_SUBTITULO = 0.7;
export const SUBTITULO_MAXIMO = 500;
export const SUBTITULOS_MAXIMOS = 200;

/**
 * Deja el texto de un subtítulo en algo que se puede meter en un SRT o en un WebVTT sin romperlos.
 *
 * Los dos formatos separan los bloques con una **línea en blanco** y marcan los tiempos con `-->`, así que un texto
 * que traiga cualquiera de las dos cosas parte el fichero en cues falsos y descoloca la numeración. No es una
 * escalada entre cuentas —es el fichero del propio usuario—, pero sí un archivo corrupto que se publica.
 *
 * Se normaliza en lugar de rechazar: quien pega un texto con saltos de Windows no está atacando nada, y decirle
 * que su texto «no es válido» no le ayudaría a arreglarlo.
 */
export function normalizarTextoDeSubtitulo(texto: string): string {
  return (
    texto
      .replace(/\r\n?/g, "\n")
      // La flecha de tiempos se sustituye por una flecha de verdad: se lee igual y no abre un cue.
      .replace(/--+>/g, "→")
      // Nunca una línea en blanco dentro de un subtítulo: ahí acaba el bloque.
      .replace(/\n[ \t]*\n+/g, "\n")
      .split("\n")
      .map((linea) => linea.trim())
      .join("\n")
      .trim()
  );
}

/** Aviso de legibilidad de un subtítulo. Avisa, no bloquea: quien edita decide. */
export interface AvisoSubtitulo {
  indice: number;
  motivo: string;
}

/** Los tiempos sí se exigen: un subtítulo que acaba antes de empezar no se puede exportar. */
export function erroresDeSubtitulos(subtitulos: readonly Subtitulo[]): string[] {
  const errores: string[] = [];
  let anterior = -1;
  for (const [i, s] of subtitulos.entries()) {
    const n = i + 1;
    if (!Number.isFinite(s.desde) || !Number.isFinite(s.hasta) || s.desde < 0) {
      errores.push(`El subtítulo ${n} no tiene tiempos válidos.`);
      continue;
    }
    if (s.hasta <= s.desde) errores.push(`El subtítulo ${n} acaba antes de empezar.`);
    if (s.desde < anterior) errores.push(`El subtítulo ${n} empieza antes de que acabe el anterior.`);
    if (s.texto.trim() === "") errores.push(`El subtítulo ${n} está vacío.`);
    anterior = Math.max(anterior, s.hasta);
  }
  return errores;
}

/** Avisos de legibilidad: líneas largas, demasiadas líneas o un subtítulo que pasa demasiado rápido. */
export function avisosDeSubtitulos(subtitulos: readonly Subtitulo[]): AvisoSubtitulo[] {
  const avisos: AvisoSubtitulo[] = [];
  for (const [indice, s] of subtitulos.entries()) {
    const lineas = s.texto.split("\n");
    if (lineas.length > LINEAS_POR_SUBTITULO) {
      avisos.push({ indice, motivo: `Tiene ${lineas.length} líneas: más de ${LINEAS_POR_SUBTITULO} tapan la imagen.` });
    }
    const larga = lineas.find((l) => l.length > CARACTERES_POR_LINEA);
    if (larga !== undefined) {
      avisos.push({
        indice,
        motivo: `Hay una línea de ${larga.length} caracteres: por encima de ${CARACTERES_POR_LINEA} no se lee bien en vertical.`,
      });
    }
    if (s.hasta - s.desde < SEGUNDOS_MINIMOS_SUBTITULO) {
      avisos.push({
        indice,
        motivo: `Dura ${(s.hasta - s.desde).toFixed(2)} s: por debajo de ${SEGUNDOS_MINIMOS_SUBTITULO} s no se llega a leer.`,
      });
    }
  }
  return avisos;
}

/**
 * Parte un texto en líneas de como mucho {@link CARACTERES_POR_LINEA} caracteres, sin cortar palabras. Es lo que
 * propone el editor al dividir líneas; lo que se guarda es siempre lo que deja quien edita.
 */
export function dividirEnLineas(texto: string, maximo = CARACTERES_POR_LINEA): string {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.replace(/\s+/g, " ").trim().split(" ")) {
    if (palabra === "") continue;
    if (actual === "") actual = palabra;
    else if (actual.length + 1 + palabra.length <= maximo) actual = `${actual} ${palabra}`;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual !== "") lineas.push(actual);
  return lineas.join("\n");
}

/**
 * Subtítulos propuestos a partir del texto del diálogo y de la duración del audio. Se reparte el tiempo **en
 * proporción a los caracteres** de cada frase, que es lo más honesto que se puede hacer sin medir el audio: no
 * finge una alineación palabra a palabra que nadie ha medido.
 */
export function subtitulosDesdeTexto(texto: string, segundos: number): Subtitulo[] {
  const frases = texto
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f !== "");
  if (frases.length === 0 || !(segundos > 0)) return [];
  const total = frases.reduce((suma, f) => suma + f.length, 0);
  const salida: Subtitulo[] = [];
  let desde = 0;
  for (const [i, frase] of frases.entries()) {
    const duracion = (frase.length / total) * segundos;
    const hasta = i === frases.length - 1 ? segundos : Math.round((desde + duracion) * 100) / 100;
    salida.push({ desde: Math.round(desde * 100) / 100, hasta, texto: dividirEnLineas(frase) });
    desde = hasta;
  }
  return salida;
}

/** Subtítulos a partir de los segmentos de una transcripción: los tiempos son los medidos, no repartidos. */
export function subtitulosDesdeTranscripcion(segmentos: readonly Subtitulo[]): Subtitulo[] {
  return segmentos
    .filter((s) => s.texto.trim() !== "" && s.hasta > s.desde)
    .map((s) => ({ desde: s.desde, hasta: s.hasta, texto: dividirEnLineas(s.texto) }));
}

const dosCifras = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** `hh:mm:ss,mmm` (SRT) o `hh:mm:ss.mmm` (WebVTT), según el separador de los milisegundos. */
function marca(segundos: number, separador: "," | "."): string {
  const totales = Math.max(0, segundos);
  const ms = Math.round((totales - Math.floor(totales)) * 1000);
  const enteros = Math.floor(totales);
  return `${dosCifras(enteros / 3600)}:${dosCifras((enteros % 3600) / 60)}:${dosCifras(enteros % 60)}${separador}${String(ms).padStart(3, "0")}`;
}

export const FORMATOS_SUBTITULOS = ["srt", "vtt"] as const;
export type FormatoSubtitulos = (typeof FORMATOS_SUBTITULOS)[number];

export const esFormatoSubtitulos = (v: unknown): v is FormatoSubtitulos =>
  FORMATOS_SUBTITULOS.includes(v as FormatoSubtitulos);

export const MIME_SUBTITULOS: Record<FormatoSubtitulos, string> = {
  srt: "application/x-subrip; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
};

/**
 * Fichero de subtítulos del proyecto entero, con los tiempos **corridos** escena a escena: cada escena empieza
 * donde acaba la anterior, que es el orden en el que se montará el vídeo.
 *
 * Se exporta desde los subtítulos **editados**, nunca desde la transcripción cruda: lo que se publica es lo que
 * la persona ha corregido.
 */
export interface EscenaConSubtitulos {
  orden: number;
  segundos: number;
  subtitulos: readonly Subtitulo[];
}

export function componerSubtitulos(escenas: readonly EscenaConSubtitulos[], formato: FormatoSubtitulos): string {
  const separador = formato === "srt" ? "," : ".";
  const bloques: string[] = [];
  let desplazamiento = 0;
  let numero = 0;
  for (const escena of [...escenas].sort((a, b) => a.orden - b.orden)) {
    for (const s of escena.subtitulos) {
      // El texto se normaliza también aquí, y no solo al guardarlo: lo que sale del fichero no puede depender de
      // por qué camino entró la fila (una migración, un guardado antiguo, un script).
      const texto = normalizarTextoDeSubtitulo(s.texto);
      // Un bloque sin texto no se emite: descolocaría la numeración y no diría nada.
      if (texto === "") continue;
      numero++;
      const desde = marca(desplazamiento + s.desde, separador);
      const hasta = marca(desplazamiento + s.hasta, separador);
      // El número de bloque solo lo lleva el SRT; en WebVTT es opcional y se omite.
      bloques.push(`${formato === "srt" ? `${numero}\n` : ""}${desde} --> ${hasta}\n${texto}`);
    }
    desplazamiento += escena.segundos;
  }
  const cuerpo = bloques.join("\n\n");
  return formato === "vtt" ? `WEBVTT\n\n${cuerpo}\n` : `${cuerpo}\n`;
}

/**
 * Zonas seguras de las plataformas verticales, en % del alto: lo de arriba lo tapa la interfaz de la app y lo de
 * abajo, los botones y el texto del pie. La previsualización las dibuja para que nadie coloque un subtítulo
 * donde nadie lo va a leer.
 */
export const ZONA_SEGURA = { arribaPorCiento: 12, abajoPorCiento: 22 } as const;

// ── Música ───────────────────────────────────────────────────────────────────────────────────────────────────

export const VOLUMEN_MUSICA_POR_DEFECTO = 0.2;
export const NOTA_DERECHOS_MINIMA = 10;
export const NOTA_DERECHOS_MAXIMA = 300;

/**
 * Pista de música de un proyecto. **Solo subida por el usuario** (decisión provisional del propietario,
 * 2026-09-28): no se genera música en esta versión, y sin declaración de derechos escrita no se añade.
 */
export interface MusicaVista {
  id: string;
  medio: Medio | null;
  /** Qué dice el usuario sobre su derecho a usarla. Obligatoria: es una declaración, y se guarda con su fecha. */
  notaDerechos: string;
  declaradoEn: string;
  /** 0–1. Volumen relativo con el que entrará en la mezcla (0.22.0). */
  volumen: number;
}

// ── Vistas de la pantalla ────────────────────────────────────────────────────────────────────────────────────

/** Estado de la voz y los subtítulos de una escena. */
export interface EscenaVozVista {
  id: string;
  orden: number;
  resumen: string;
  segundos: number;
  dialogo: string;
  clip: Medio | null;
  /** Audio de voz generado para esta escena; `null` en modo `clip`, que no tiene pista propia. */
  audio: Medio | null;
  /** `true` cuando el audio o los subtítulos se generaron con otra voz, otro modo u otro diálogo. */
  invalidada: boolean;
  /**
   * `true` en modo `pista` cuando el clip **ya producido** lleva el diálogo hablado dentro (se produjo en modo
   * `clip`). No es una invalidación —el clip sigue valiendo como imagen y no hay voz que regenerar—, pero hay que
   * volver a producir esa escena o se oirán dos voces diciendo lo mismo.
   */
  clipHablado: boolean;
  invalidacion: string;
  subtitulos: Subtitulo[];
  /** `true` si los subtítulos los ha tocado una persona. Lo exportado siempre son estos. */
  editados: boolean;
  /** Avisos de legibilidad de los subtítulos guardados. */
  avisos: AvisoSubtitulo[];
  /** Estado del trabajo de voz en marcha, si hay uno. */
  trabajoEnMarcha: string | null;
  /**
   * Motivo del último trabajo de voz que falló, si es lo último que le ha pasado a la voz de esta escena. Sale de
   * su propio trabajo: el fallo de una pista de voz no es un fallo de la escena, que se produce con su clip.
   */
  fallo: string | null;
}

/** Estado de voz y subtítulos del proyecto entero. */
export interface VozProyectoVista {
  proyectoId: string;
  titulo: string;
  modo: ModoVoz;
  voz: VozDelProyecto | null;
  /** Voces y modelo que ofrece esta instalación, con lo que costaría una llamada. */
  disponibilidad: DisponibilidadVoz;
  escenas: EscenaVozVista[];
  musica: MusicaVista[];
  /**
   * Muestras de voz que este usuario ya ha pagado, por voz. Lo que hay aquí **no vuelve a costar**: es lo que
   * permite decir «esta ya la has oído» en lugar de cobrar otra vez por lo mismo.
   */
  muestras: Record<string, Medio>;
  /** Escenas cuya voz o subtítulos quedaron invalidados por el último cambio, y qué costaría regenerarlos. */
  porRegenerar: number;
  /** Coste estimado de regenerar lo invalidado; `null` si no se puede estimar (sin precio medido). */
  costeRegenerar: number | null;
  /** Por qué no se puede estimar, en llano. Vacío si sí se puede. */
  motivoSinCoste: string;
}

/** Qué puede hacer esta instalación con la voz. Si algo falta, se dice **por qué**, no se oculta el botón. */
export interface DisponibilidadVoz {
  /** `true` si hay modelo de voz utilizable, con precio, y el ajuste está encendido. */
  ttsDisponible: boolean;
  motivoTts: string;
  /** Créditos por llamada de voz; `null` si el modelo no tiene precio medido y por tanto no se estima. */
  creditosPorEscena: number | null;
  sello: string;
  /** Modelo de voz que usaría esta instalación; vacío cuando no hay ninguno utilizable. */
  modelo: string;
  /** `true` si el transcriptor local está instalado y utilizable. No cuesta nada. */
  transcripcionDisponible: boolean;
  motivoTranscripcion: string;
  voces: readonly VozOfrecida[];
  /**
   * Evaluación del motor de controles para un envío de voz, con el **modelo** de esta instalación. Viaja para que
   * el diálogo de coste pueda ofrecer la casilla de cada aviso confirmable exactamente cuando el servidor la va a
   * exigir: un aviso salvable sin dónde confirmarlo deja la voz bloqueada sin salida.
   */
  controles: EvaluacionVista;
}

/** Acciones de la pantalla de voz y subtítulos. */
export const ACCIONES_VOZ = [
  "fijar-modo",
  "fijar-voz",
  "generar-voz",
  "transcribir",
  "guardar-subtitulos",
  "proponer-subtitulos",
  "anadir-musica",
  "quitar-musica",
  "volumen-musica",
] as const;
export type AccionVoz = (typeof ACCIONES_VOZ)[number];

export const esAccionVoz = (v: unknown): v is AccionVoz => ACCIONES_VOZ.includes(v as AccionVoz);
