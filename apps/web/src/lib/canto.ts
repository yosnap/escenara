import type { Medio } from "./media/tipos";

/**
 * **Cantar con audio propio** (RF06, RF08 y RF10, 0.29.0): el usuario sube una canción, una locución o una
 * grabación suya y el personaje la canta o la dice con los labios sincronizados.
 *
 * Lo que comparten el servidor y el navegador: los tipos de declaración de derechos con su texto entero, el
 * tope de duración, la resolución y el cálculo del coste. Aquí no hay nada que dependa de una credencial.
 *
 * Dos reglas de esta versión que están escritas en este fichero porque las leen las dos orillas:
 *
 * - **la declaración de derechos es por audio**, no por escena: el mismo archivo se puede usar en varias
 *   escenas con una sola declaración, y una subida distinta pide otra;
 * - **no hay comprobación automática de derechos**: ningún proveedor documenta un filtro de audio, así que lo
 *   que hay es la declaración del usuario, registrada con su fecha, su IP y el texto entero que aceptó.
 */

// ── Declaración de derechos ─────────────────────────────────────────────────────────────────────────────

/**
 * Con qué derecho usa el usuario ese audio (decisión del propietario, 2026-09-28). Son **tres y solo tres**:
 * no se ofrece ninguna casilla de «uso legítimo», porque eso es una valoración jurídica que depende del país y
 * del uso, y ponerla en un botón sería hacerla pasar por un permiso.
 */
export const TIPOS_DERECHOS_CANTO = ["propia", "licenciada", "hablado_propio"] as const;
export type TipoDerechosCanto = (typeof TIPOS_DERECHOS_CANTO)[number];

export const esTipoDerechosCanto = (v: unknown): v is TipoDerechosCanto =>
  TIPOS_DERECHOS_CANTO.includes(v as TipoDerechosCanto);

export const NOMBRE_DERECHOS_CANTO: Record<TipoDerechosCanto, string> = {
  propia: "La música es mía",
  licenciada: "Tengo licencia de la música",
  hablado_propio: "Es una grabación hablada mía",
};

export const DESCRIPCION_DERECHOS_CANTO: Record<TipoDerechosCanto, string> = {
  propia: "La compusiste y la grabaste tú, o eres el titular de sus derechos.",
  licenciada: "La usas con una licencia a tu nombre. Hay que indicar cuál: el sello, el número o dónde se compró.",
  hablado_propio: "No es música: es tu propia voz hablando, grabada por ti.",
};

/**
 * Texto que se le pone delante al usuario y que queda **guardado entero** en la declaración, como en
 * `consent_records` y en la declaración de veracidad del anuncio: lo que hay que poder demostrar es qué se le
 * mostró, no que pulsó un botón. Si una versión futura cambia la redacción, lo ya aceptado conserva la suya.
 */
export const TEXTO_DECLARACION_CANTO: Record<TipoDerechosCanto, string> = {
  propia:
    "Declaro que soy titular de los derechos de este audio o que cuento con autorización de sus titulares para usarlo en el vídeo que voy a generar y para publicarlo. Entiendo que Escenara no comprueba los derechos de ningún audio: esta declaración es mía y respondo yo de ella, incluida cualquier reclamación de terceros.",
  licenciada:
    "Declaro que uso este audio al amparo de una licencia vigente a mi nombre, cuya referencia indico, y que esa licencia cubre generar con él el vídeo y publicarlo. Entiendo que Escenara no comprueba ninguna licencia: esta declaración es mía y respondo yo de ella, incluida cualquier reclamación de terceros.",
  hablado_propio:
    "Declaro que este audio es una grabación de mi propia voz hablando, hecha por mí, y que puedo usarla para generar el vídeo y publicarlo. Entiendo que Escenara no comprueba el origen de ningún audio: esta declaración es mía y respondo yo de ella.",
};

/** La referencia de la licencia es obligatoria en `licenciada`: sin ella la declaración no dice nada. */
export const REFERENCIA_LICENCIA_MINIMA = 4;
export const REFERENCIA_LICENCIA_MAXIMA = 300;

/** `true` cuando ese tipo exige indicar la referencia de la licencia. */
export const exigeReferenciaDeLicencia = (tipo: TipoDerechosCanto): boolean => tipo === "licenciada";

/** Declaración ya registrada, tal como viaja al navegador. Nunca lleva la IP: es material de auditoría. */
export interface DeclaracionCantoVista {
  tipo: TipoDerechosCanto;
  /** Referencia de la licencia; vacía en los tipos que no la piden. */
  referenciaLicencia: string;
  /** Texto que se aceptó, entero y tal como se guardó. */
  textoAceptado: string;
  aceptadoEn: string;
}

// ── Modelos de canto ────────────────────────────────────────────────────────────────────────────────────

/**
 * Modelos de lip-sync que esta instalación **sabe pedir**, con su identificador exacto de `jobs/createTask`.
 * Son los dos que tienen constructor de entrada propio; cualquier otro identificador se rechaza en los ajustes,
 * porque un modelo sin constructor se enviaría a ciegas y lo pagaría el usuario.
 *
 * Precios publicados por KIE y comprobados el 2026-09-29 en su tabla pública (sin clave y sin coste):
 *
 * - `infinitalk/from-audio` (MeiGen-AI InfiniteTalk): **3 créditos/s a 480p** y 12 a 720p, «per second»,
 *   «up to 15 seconds»;
 * - `kling/v1-avatar-standard` (Kling AI Avatar Standard): **8 créditos/s a 720p**, «per second»,
 *   «up to 15 seconds».
 */
export const MODELOS_CANTO = ["infinitalk/from-audio", "kling/v1-avatar-standard"] as const;
export type ModeloCanto = (typeof MODELOS_CANTO)[number];

export const esModeloCanto = (v: unknown): v is ModeloCanto => MODELOS_CANTO.includes(v as ModeloCanto);

/** El más barato de los dos, que es el que se ofrece de fábrica. */
export const MODELO_CANTO_POR_DEFECTO: ModeloCanto = "infinitalk/from-audio";

/** Nombre legible de cada uno, el mismo que publica el proveedor. */
export const NOMBRE_MODELO_CANTO: Record<ModeloCanto, string> = {
  "infinitalk/from-audio": "MeiGen-AI InfiniteTalk",
  "kling/v1-avatar-standard": "Kling AI Avatar Standard",
};

// ── Duración y resolución ───────────────────────────────────────────────────────────────────────────────

/**
 * Tope de duración del audio, en segundos. **15 de fábrica** porque es la unidad que publica el proveedor
 * («up to 15 seconds», tabla de precios de KIE comprobada el 2026-09-29) y porque es el tramo del que hay
 * evidencia; quien administra lo puede bajar hasta 1 s en Admin › Ajustes.
 */
export const SEGUNDOS_CANTO_POR_DEFECTO = 15;
export const SEGUNDOS_CANTO_MAXIMOS = 15;

/** Resoluciones que esta instalación ofrece para el canto, con la grafía exacta del proveedor. */
export const RESOLUCIONES_CANTO = ["480p", "720p"] as const;
export type ResolucionCanto = (typeof RESOLUCIONES_CANTO)[number];

export const esResolucionCanto = (v: unknown): v is ResolucionCanto =>
  RESOLUCIONES_CANTO.includes(v as ResolucionCanto);

/**
 * Segundos que se le facturan a un audio: **el segundo entero siguiente**. El proveedor cobra por segundo, así
 * que un audio de 7,3 s se paga como 8: redondear a la baja haría reservar menos de lo que se cobra.
 */
export const segundosFacturados = (duracion: number): number => Math.max(1, Math.ceil(duracion - 1e-6));

/**
 * Coste del clip cantado: segundos facturados × tarifa de la resolución elegida, redondeado como el resto del
 * gasto. La tarifa **nunca se inventa**: llega del precio registrado de esa duración y esa resolución.
 */
export const creditosDeCanto = (creditosDeLaTarifa: number): number => Math.ceil(creditosDeLaTarifa);

// ── Retrato de partida ──────────────────────────────────────────────────────────────────────────────────

/**
 * Proporción mínima de alto entre ancho para dar el retrato por **vertical**. Ninguno de los modelos de
 * lip-sync documenta `aspect_ratio`: el formato del clip lo fija la imagen de partida, así que un retrato
 * horizontal daría un clip horizontal y eso se paga igual (decisión del propietario, 2026-09-28).
 *
 * 1 exacto no basta —un cuadrado no es vertical— y exigir 9:16 clavado dejaría fuera un 3:4 perfectamente
 * utilizable, así que el corte está en «más alto que ancho».
 */
export const PROPORCION_VERTICAL_MINIMA = 1.05;

/** `true` cuando esa imagen es vertical según {@link PROPORCION_VERTICAL_MINIMA}. */
export const esRetratoVertical = (ancho: number, alto: number): boolean =>
  ancho > 0 && alto > 0 && alto / ancho >= PROPORCION_VERTICAL_MINIMA;

/** Proporción escrita como la leería una persona («1080 × 1920»). */
export const proporcionEscrita = (ancho: number, alto: number): string =>
  `${ancho} × ${alto} px${ancho >= alto ? " (horizontal o cuadrada)" : ""}`;

// ── Vista de la escena de canto ─────────────────────────────────────────────────────────────────────────

/** Qué falta para poder generar, en llano. Lo compone el servidor y lo pinta la pantalla tal cual. */
export interface ImpedimentoCanto {
  /** Clave estable, la misma que la regla del motor de controles cuando la hay. */
  clave: string;
  motivo: string;
  accion: string;
}

/**
 * Estado del canto de una escena, tal como lo devuelve la API. Es lo único que la pantalla necesita saber: qué
 * audio hay, cuánto dura, si está declarado, si el retrato sirve y cuánto costaría.
 */
export interface CantoVista {
  /** El canto está encendido en esta instalación (Admin › Ajustes). Apagado, no se ofrece ni se genera. */
  activo: boolean;
  /** `true` cuando el formato de la escena es `cantar`. */
  esEscenaDeCanto: boolean;
  /** Audio elegido para esta escena, o `null` si todavía no hay ninguno. */
  audio: Medio | null;
  /** Duración medida del audio en segundos; `null` si no hay audio o no se ha podido medir. */
  duracion: number | null;
  /** Segundos que se facturarían (el entero siguiente); `null` sin audio. */
  segundosFacturados: number | null;
  /** Tope vigente de esta instalación, en segundos. */
  segundosMaximos: number;
  resolucion: ResolucionCanto;
  /** Declaración vigente **de ese audio**; `null` si falta. */
  declaracion: DeclaracionCantoVista | null;
  /** Retrato del personaje con el que se generaría, y si su proporción sirve. */
  retrato: { medio: Medio | null; vertical: boolean; proporcion: string };
  /** Coste del clip con el audio y la resolución de ahora; `null` cuando todavía no se puede calcular. */
  coste: CosteCantoVista | null;
  /** Todo lo que impide generar. Vacío = se puede pedir. */
  impedimentos: ImpedimentoCanto[];
  /** Avisos que se pueden aceptar expresamente al confirmar el coste. */
  avisos: { regla: string; motivo: string }[];
}

/** Coste de un clip cantado, con de dónde sale su precio. Siempre se enseña etiquetado como estimación. */
export interface CosteCantoVista {
  /** Coste del modelo de vídeo: segundos facturados × tarifa publicada de la resolución. */
  creditos: number;
  euros: number;
  /** Total que debe confirmar el usuario: exactamente el precio del audio por segundo. */
  creditosAConfirmar: number;
  /** Compatibilidad con la vista de costes común: el canto no encarga traducción de pago. */
  creditosTraduccion: number;
  eurosAConfirmar: number;
  /** Unidad registrada que se cobra («clip cantado de 8 s a 480p»). */
  unidad: string;
  /** Sello del precio: viaja en la confirmación y caduca la estimación si el precio cambia. */
  sello: string;
  /** De dónde sale el precio, tal como se guardó. */
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó. */
  comprobado: string;
  /** `true` cuando el precio es la tarifa publicada por el proveedor y no una medida en esta instalación. */
  publicado: boolean;
  nombreModelo: string;
  /** Créditos por segundo de la resolución elegida: es lo que explica la cifra. */
  creditosPorSegundo: number;
}
