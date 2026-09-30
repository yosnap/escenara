import type { OrigenReferencia, TipoPersonaje } from "./personajes";

/**
 * Captura guiada de referencias (RF03): qué vistas hace falta cubrir, qué mide el control de calidad y por
 * qué se rechaza una foto. Aquí no hay nada que dependa de la base de datos ni del navegador: solo la forma
 * de los datos y los textos, para que el servidor y la interfaz digan **exactamente lo mismo**.
 *
 * Regla dura de la versión: **una vista generada nunca cuenta como foto original**. Se marca en la base de
 * datos (`origin = 'vista_generada'`), viaja marcada en la API y se muestra siempre con su distintivo. El
 * mínimo de fotos que exige Admin › Ajustes cuenta solo `foto_original`.
 */

/** Vistas que reconoce la cobertura. `perfil` es la de los animales; las personas usan izquierdo y derecho. */
export const VISTAS = [
  "frontal",
  "perfil_izquierdo",
  "perfil_derecho",
  "perfil",
  "tres_cuartos",
  "cuerpo_completo",
] as const;
export type Vista = (typeof VISTAS)[number];

export const esVista = (v: unknown): v is Vista => VISTAS.includes(v as Vista);

/**
 * Vistas mínimas de cobertura por tipo de personaje (decisión 1 de la fase). No sustituyen al mínimo de
 * fotos de Admin › Ajustes: la cobertura dice **qué** falta, el mínimo dice **cuántas** hacen falta.
 */
export const VISTAS_MINIMAS: Record<TipoPersonaje, readonly Vista[]> = {
  persona: ["frontal", "perfil_izquierdo", "perfil_derecho", "tres_cuartos", "cuerpo_completo"],
  animal: ["frontal", "perfil", "cuerpo_completo"],
};

export const vistasMinimas = (tipo: TipoPersonaje): readonly Vista[] => VISTAS_MINIMAS[tipo];

export const ETIQUETA_VISTA: Record<Vista, string> = {
  frontal: "De frente",
  perfil_izquierdo: "Perfil izquierdo",
  perfil_derecho: "Perfil derecho",
  perfil: "De perfil",
  tres_cuartos: "Tres cuartos",
  cuerpo_completo: "Cuerpo completo",
};

/** Qué tiene que hacer la persona delante de la cámara. Es lo que se lee dentro del visor. */
export const INDICACION_VISTA: Record<Vista, string> = {
  frontal: "Mira a la cámara con la cara centrada y los hombros rectos.",
  perfil_izquierdo: "Gira la cabeza del todo a tu izquierda, hasta ver la oreja.",
  perfil_derecho: "Gira la cabeza del todo a tu derecha, hasta ver la oreja.",
  perfil: "Coloca al animal de lado, con todo el perfil a la vista.",
  tres_cuartos: "Gira la cabeza a medias, a unos 45 grados de la cámara.",
  cuerpo_completo: "Aléjate hasta que se vea el cuerpo entero, de la cabeza a los pies.",
};

/**
 * Silueta que se dibuja dentro del marco «Enfoque» como guía. Es una ruta SVG sobre un lienzo de 100 × 100
 * y con `vector-effect` de trazo fino: orienta el encuadre sin tapar la imagen.
 */
export const SILUETA_VISTA: Record<Vista, string> = {
  frontal: "M50 22a13 13 0 1 1 0 26 13 13 0 0 1 0-26M28 86c0-16 10-26 22-26s22 10 22 26",
  perfil_izquierdo: "M58 22a13 13 0 1 0-6 25l-3 9h7M34 86c0-16 10-26 22-26s20 10 20 26",
  perfil_derecho: "M42 22a13 13 0 1 1 6 25l3 9h-7M66 86c0-16-10-26-22-26s-20 10-20 26",
  perfil: "M26 46a12 12 0 0 1 14-10l10 4h20l10 14-6 12H38z M34 66v16M46 66v16M62 66v16M74 66v16",
  tres_cuartos: "M54 22a13 13 0 1 1-2 26 13 13 0 0 1 2-26M30 86c0-16 10-26 22-26s22 10 22 26",
  // Figura continua y del mismo trazo que las demás: cabeza, tronco con hombros y las dos piernas salen del
  // propio tronco, sin partes suspendidas en el aire.
  cuerpo_completo:
    "M50 12a7 7 0 1 1 0 14 7 7 0 0 1 0-14M50 26c-7 0-11 4-12 10l-4 16 5 2 3-10v14l-4 32M50 26c7 0 11 4 12 10l4 16-5 2-3-10v14l4 32",
};

/** Orientación recomendada del encuadre: el cuerpo entero pide vertical, los retratos cuadrado. */
export const RELACION_VISTA: Record<Vista, "cuadrada" | "vertical"> = {
  frontal: "cuadrada",
  perfil_izquierdo: "cuadrada",
  perfil_derecho: "cuadrada",
  perfil: "cuadrada",
  tres_cuartos: "cuadrada",
  cuerpo_completo: "vertical",
};

/**
 * ¿Tiene sentido medir el tamaño de la cara en esta vista? Solo en personas y solo en los retratos: en un
 * cuerpo entero la cara **es** pequeña, y en un animal el detector de caras del navegador no encuentra
 * ninguna. Medirlo ahí daría un aviso falso en todos los casos, que es peor que no medirlo.
 */
export const midaCara = (vista: Vista, tipo: TipoPersonaje): boolean =>
  tipo === "persona" && vista !== "cuerpo_completo";

/**
 * Indicación con la que se pide una vista sintética al proveedor. La escribe el servidor a partir de la
 * vista, **nunca el navegador**: así una vista generada no puede convertirse en un hueco por el que colar
 * cualquier indicación con las fotos del personaje dentro.
 */
/**
 * Proporción con la que se pide una vista: las de la cabeza en **3:4**, que deja la cara grande y centrada, y el
 * cuerpo entero en vertical 9:16. En 9:16 una vista de cabeza sale con la cara pequeña y fuera de sitio.
 */
export const proporcionDeVista = (vista: Vista | null): string => (vista === "cuerpo_completo" ? "9:16" : "3:4");

export function promptDeVista(vista: Vista, tipo: TipoPersonaje): string {
  const sujeto = tipo === "animal" ? "el mismo animal" : "la misma persona";
  const encuadre: Record<Vista, string> = {
    frontal: "de frente, mirando a la cámara",
    perfil_izquierdo: "de perfil izquierdo completo",
    perfil_derecho: "de perfil derecho completo",
    perfil: "de perfil completo, de lado",
    tres_cuartos: "en tres cuartos, girado unos 45 grados",
    cuerpo_completo: "de cuerpo entero, de la cabeza a los pies",
  };
  const plano =
    vista === "cuerpo_completo"
      ? "con el cuerpo entero dentro del encuadre y centrado"
      : "en primer plano de cabeza y hombros, con la cara centrada y ocupando buena parte del encuadre";
  return `Foto de referencia de ${sujeto} ${encuadre[vista]}, ${plano}, fondo neutro y liso, luz suave y uniforme, sin cambiar los rasgos, el peinado, la ropa ni la edad, sin texto ni marcas de agua.`;
}

/** Por qué se marca o se rechaza una foto de referencia. */
export const MOTIVOS_RECHAZO = [
  "resolucion",
  "enorme",
  "nitidez",
  "oscuridad",
  "quemada",
  "cara_pequena",
  "duplicada",
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export const esMotivoRechazo = (v: unknown): v is MotivoRechazo => MOTIVOS_RECHAZO.includes(v as MotivoRechazo);

export const ETIQUETA_MOTIVO: Record<MotivoRechazo, string> = {
  resolucion: "Foto pequeña",
  enorme: "Foto demasiado grande",
  nitidez: "Foto borrosa",
  oscuridad: "Poca luz",
  quemada: "Demasiada luz",
  cara_pequena: "Cara pequeña",
  duplicada: "Duplicada",
};

/** Qué hacer para arreglarlo. Un rechazo sin acción concreta solo frustra. */
export const ACCION_MOTIVO: Record<MotivoRechazo, string> = {
  resolucion:
    "Tiene poca resolución (quizá está recortada o es una captura): guiará algo peor la identidad. Si tienes la original, mejor; si no, puedes usarla de todas formas.",
  enorme:
    "Tiene demasiados píxeles para analizarla sin bloquear el servidor. Redúcela (basta con 2000 px de lado) y vuelve a subirla.",
  nitidez: "Sujeta el móvil con las dos manos, espera a que enfoque y repite la foto.",
  oscuridad: "Ponte de cara a una ventana o enciende una luz: así se ve la cara.",
  quemada: "Apártate del foco o baja la luz: los rasgos se están perdiendo en el blanco.",
  cara_pequena: "Acércate hasta que la cara ocupe buena parte del encuadre.",
  duplicada: "Ya tienes esta foto (o una casi idéntica) en el personaje. Haz otra desde otro ángulo.",
};

/**
 * Los mínimos técnicos no se pueden saltar con «usar de todas formas»: una foto que no se puede analizar sin
 * bloquear el servidor, o una que ya está. Una foto **pequeña** no es uno de ellos (decisión del propietario,
 * 2026-09-28): una foto real recortada guía algo peor la identidad, pero sigue siendo suya y útil, así que se
 * avisa y se deja usar, y el control previo de generar la sigue señalando.
 */
export const MOTIVOS_TECNICOS: readonly MotivoRechazo[] = ["enorme", "duplicada"];

export const esMotivoTecnico = (motivo: MotivoRechazo): boolean => MOTIVOS_TECNICOS.includes(motivo);

/**
 * Tamaño con el que la biblioteca **va a guardar** una imagen: se reduce para que quepa en `MAX_IMAGEN` sin
 * ampliarla nunca (`server/media/procesado.ts`). El navegador juzga la resolución con esta medida y no con la
 * del archivo original: si no, una foto de 6000 px pasaría el control y el servidor la rechazaría después por
 * pequeña, porque lo que mide el servidor es el archivo ya reducido.
 */
export function dimensionesTrasReducir(
  ancho: number,
  alto: number,
  maximo: { ancho: number; alto: number },
): { ancho: number; alto: number } {
  if (ancho <= 0 || alto <= 0) return { ancho: 0, alto: 0 };
  const escala = Math.min(1, maximo.ancho / ancho, maximo.alto / alto);
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/** Medidas de calidad de una foto. `caraRelativa` es `null` cuando el navegador no sabe detectar caras. */
export interface MetricasCalidad {
  ancho: number;
  alto: number;
  /** Varianza del laplaciano sobre la luminancia, en la escala 0–255. Más alta = más nítida. */
  nitidez: number;
  /** Luminancia media, 0–255. */
  luminosidad: number;
  /** Proporción del lado menor que ocupa la cara más grande, 0–1; `null` si no se ha medido. */
  caraRelativa: number | null;
}

/** Resultado del control de calidad de una foto. */
export interface VeredictoCalidad {
  aceptada: boolean;
  motivos: MotivoRechazo[];
  /** `true` si algún motivo es un mínimo técnico: entonces no hay «usar de todas formas». */
  bloqueante: boolean;
  metricas: MetricasCalidad;
}

/** Umbrales del control de calidad, tal como los configura Admin › Ajustes. */
export interface UmbralesCalidad {
  ladoMinimo: number;
  nitidezMinima: number;
  luminosidadMinima: number;
  luminosidadMaxima: number;
  /** Proporción mínima de la cara, en tanto por ciento del lado menor. 0 la desactiva. */
  caraMinima: number;
}

/**
 * Aplica los umbrales a unas métricas. Es la **misma** función en el servidor y en el navegador: la interfaz
 * puede avisar antes de subir nada y el servidor decide igual, así que nunca dicen cosas distintas.
 */
export function evaluarCalidad(metricas: MetricasCalidad, umbrales: UmbralesCalidad): VeredictoCalidad {
  const motivos: MotivoRechazo[] = [];
  if (Math.min(metricas.ancho, metricas.alto) < umbrales.ladoMinimo) motivos.push("resolucion");
  if (metricas.nitidez < umbrales.nitidezMinima) motivos.push("nitidez");
  if (metricas.luminosidad < umbrales.luminosidadMinima) motivos.push("oscuridad");
  else if (metricas.luminosidad > umbrales.luminosidadMaxima) motivos.push("quemada");
  if (umbrales.caraMinima > 0 && metricas.caraRelativa !== null && metricas.caraRelativa < umbrales.caraMinima / 100) {
    motivos.push("cara_pequena");
  }
  return {
    aceptada: motivos.length === 0,
    motivos,
    bloqueante: motivos.some(esMotivoTecnico),
    metricas,
  };
}

/**
 * Foto que el control de calidad no ha dejado guardar, con el detalle que necesita la interfaz para decir por
 * qué y para ofrecer «usar de todas formas» **solo** donde tiene sentido.
 */
export interface RechazoDeReferencia {
  medioId: string;
  motivos: MotivoRechazo[];
  /** `true` cuando el motivo es un mínimo técnico: no se puede añadir de todas formas. */
  bloqueante: boolean;
  metricas: MetricasCalidad;
}

/**
 * Rechazos repartidos en los que se pueden **usar de todas formas** y los que no. Es lo que decide si la
 * interfaz ofrece el botón por cada foto: un mínimo técnico se explica, pero no se ofrece saltarlo.
 *
 * El `bloqueante` que manda es el del servidor, y si faltara se recalcula con los motivos: así una respuesta
 * antigua o incompleta nunca acaba ofreciendo saltarse un mínimo técnico.
 */
export interface RechazosClasificados {
  salvables: RechazoDeReferencia[];
  bloqueantes: RechazoDeReferencia[];
}

export const esRechazoBloqueante = (rechazo: RechazoDeReferencia): boolean =>
  rechazo.bloqueante || rechazo.motivos.some(esMotivoTecnico);

export function clasificarRechazos(rechazos: readonly RechazoDeReferencia[]): RechazosClasificados {
  const salvables: RechazoDeReferencia[] = [];
  const bloqueantes: RechazoDeReferencia[] = [];
  for (const rechazo of rechazos) (esRechazoBloqueante(rechazo) ? bloqueantes : salvables).push(rechazo);
  return { salvables, bloqueantes };
}

/** Fotos que se pueden reenviar con `usarDeTodasFormas`, sin repetir ninguna. */
export const medioIdsSalvables = (rechazos: readonly RechazoDeReferencia[]): string[] => [
  ...new Set(clasificarRechazos(rechazos).salvables.map((r) => r.medioId)),
];

/** Estado de una vista en el panel de cobertura. */
export interface CoberturaVista {
  vista: Vista;
  etiqueta: string;
  indicacion: string;
  /** Referencias que cubren esta vista, con su origen: una vista generada **no** cubre como foto original. */
  originales: number;
  generadas: number;
  /**
   * De las generadas, las que **Jev ha dado por la misma persona** (0.24.0). Son las que cubren en un personaje
   * real: una vista que no se parece no guía, guía mal.
   */
  generadasVerificadas: number;
}

export interface Cobertura {
  vistas: CoberturaVista[];
  /** Vistas mínimas sin ninguna foto original. La primera es la que propone la guía. */
  faltan: Vista[];
  /** Fotos sin vista asignada: cuentan para el mínimo, pero no cubren ninguna vista. */
  sinClasificar: number;
  /**
   * `true` si el parecido decide la cobertura: solo en modo Activa. En sombra el veredicto se guarda y se enseña,
   * pero una vista generada no cubre por él.
   */
  identidadDecide: boolean;
}

/** Veredicto de identidad de una referencia (0.24.0). `sin_comprobar` **no** significa «sospechosa». */
export type IdentidadReferencia = "sin_comprobar" | "pasa" | "revisar" | "no_pasa";

/** Referencia reducida a lo que necesita la cobertura. */
export interface ReferenciaParaCobertura {
  vistaClave: Vista | null;
  origen: OrigenReferencia;
  /**
   * Veredicto de la comprobación de identidad (0.24.0). En una foto original y en lo anterior a esta versión es
   * `sin_comprobar`, que es como estaba todo hasta ahora.
   */
  identidad?: IdentidadReferencia;
}

/**
 * Referencias agrupadas por la vista que tienen asignada, en el orden en que llegan (que es el orden en el que
 * se envían al proveedor). Las que no tienen vista no entran en ningún grupo.
 *
 * Va aparte de `calcularCobertura` a propósito: la cobertura solo **cuenta**, y la usan también el motor de
 * controles y el contexto del prompt, donde las fotos no vienen al caso. Esto es lo que necesita la interfaz
 * para enseñar *cuáles* son las fotos de cada vista en vez de un número suelto.
 */
export function agruparPorVista<T extends ReferenciaParaCobertura>(referencias: readonly T[]): Map<Vista, T[]> {
  const grupos = new Map<Vista, T[]>();
  for (const referencia of referencias) {
    if (!referencia.vistaClave) continue;
    const grupo = grupos.get(referencia.vistaClave);
    if (grupo) grupo.push(referencia);
    else grupos.set(referencia.vistaClave, [referencia]);
  }
  return grupos;
}

/**
 * Cobertura de vistas de un personaje. Derivada, no guardada: si mañana cambian las vistas mínimas, la
 * cobertura cambia sola y no hay que migrar ninguna columna.
 */
/**
 * `generadasCubren`: en un personaje **inventado** sus vistas generadas cubren sin más, porque no tiene ni admite
 * fotos reales y su cara **es** la generada.
 *
 * En uno **real** cubre la foto original y, desde la 0.24.0, también la vista generada **que Jev ha dado por la
 * misma persona**. Hasta entonces ninguna generada cubría nunca, precisamente porque podía no parecerse; ahora eso
 * se comprueba y el veredicto es el que decide. Una generada `sin_comprobar`, `revisar` o `no_pasa` sigue sin
 * cubrir: lo que no se ha verificado no vale como verificado.
 */
export function calcularCobertura(
  tipo: TipoPersonaje,
  referencias: readonly ReferenciaParaCobertura[],
  generadasCubren = false,
  identidadDecide = true,
): Cobertura {
  const vistas = vistasMinimas(tipo).map<CoberturaVista>((vista) => {
    const suyas = referencias.filter((r) => r.vistaClave === vista);
    const generadas = suyas.filter((r) => r.origen === "vista_generada");
    return {
      vista,
      etiqueta: ETIQUETA_VISTA[vista],
      indicacion: INDICACION_VISTA[vista],
      originales: suyas.filter((r) => r.origen === "foto_original").length,
      generadas: generadas.length,
      generadasVerificadas: identidadDecide ? generadas.filter((r) => r.identidad === "pasa").length : 0,
    };
  });
  const cubre = (v: CoberturaVista) =>
    v.originales > 0 || v.generadasVerificadas > 0 || (generadasCubren && v.generadas > 0);
  return {
    vistas,
    faltan: vistas.filter((v) => !cubre(v)).map((v) => v.vista),
    sinClasificar: referencias.filter((r) => r.vistaClave === null).length,
    identidadDecide,
  };
}

/**
 * Vistas que se pueden **generar de una vez** (0.22.1): las que no tienen ninguna foto original y tampoco una
 * vista generada. Es exactamente lo que acepta `pedirVistaSintetica`, así que el navegador puede enseñar el
 * coste total sin que el servidor rechace después la mitad de lo que se ha confirmado.
 *
 * Una vista que ya tiene una generada **no** entra: encadenar generadas sería gastar créditos cada vez.
 */
export function vistasPorGenerar(cobertura: Cobertura): Vista[] {
  return cobertura.vistas.filter((v) => v.originales === 0 && v.generadas === 0).map((v) => v.vista);
}

/** Largo en caracteres hexadecimales de la huella perceptual (dHash de 64 bits). */
export const LARGO_HUELLA = 16;

/**
 * Distancia de Hamming entre dos huellas perceptuales en hexadecimal. Cuanto más baja, más se parecen las
 * dos fotos; `null` si alguna huella no es válida.
 */
export function distanciaHuella(a: string, b: string): number | null {
  if (a.length !== LARGO_HUELLA || b.length !== LARGO_HUELLA) return null;
  let distancia = 0;
  for (let i = 0; i < LARGO_HUELLA; i++) {
    const x = Number.parseInt(a[i] as string, 16);
    const y = Number.parseInt(b[i] as string, 16);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    for (let bit = x ^ y; bit > 0; bit >>= 1) distancia += bit & 1;
  }
  return distancia;
}

/**
 * Distancia por debajo de la cual dos fotos se consideran la misma. Con 64 bits, 6 bits de diferencia son
 * dos capturas seguidas del mismo encuadre; a partir de ahí ya se distingue un gesto o un giro.
 */
export const DISTANCIA_DUPLICADO = 6;

export const esCasiIgual = (a: string, b: string): boolean => {
  const distancia = distanciaHuella(a, b);
  return distancia !== null && distancia <= DISTANCIA_DUPLICADO;
};
