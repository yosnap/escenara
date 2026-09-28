/**
 * Vocabulario de la **dirección del clip** (0.25.0): lo que el usuario elige para dirigir una escena como un
 * director, y lo que elige para dirigir el fotograma del que sale.
 *
 * Se usa en el servidor y en el navegador, así que aquí **no hay ni una palabra de inglés de prompt**: solo
 * identificadores y las etiquetas en castellano que se leen en los botones. El texto que viaja al proveedor lo
 * compone el servidor en `server/direccion/` y no sale de ahí (ADR-0022).
 *
 * Lo que es enumerado vive aquí y lo que es catálogo vive en los presets (`/admin/presets`): plano, ángulo,
 * óptica, luz, localización, cámara y micro-acción los edita quien administra sin tocar código; el formato del
 * clip, el momento del gesto, el acento, el registro estético y el modo «cambiar solo…» son estructura del
 * producto y cambiarlos es cambiar el código que los compone.
 */

// ── Formato del clip ────────────────────────────────────────────────────────────────────────────────────

/**
 * Los dos formatos de esta versión (decisión provisional del propietario, 2026-09-28). Podcast y dualcast
 * quedan para 0.27.0; el b-roll de producto, para 0.26.0.
 *
 * - `ugc_a_camara`: el personaje habla a cámara, con o sin micro-acción;
 * - `voz_en_off`: clip **mudo**; la narración se monta encima en 0.32.0.
 */
export const FORMATOS_CLIP = ["ugc_a_camara", "voz_en_off"] as const;
export type FormatoClip = (typeof FORMATOS_CLIP)[number];

export const esFormatoClip = (v: unknown): v is FormatoClip => FORMATOS_CLIP.includes(v as FormatoClip);

export const NOMBRE_FORMATO_CLIP: Record<FormatoClip, string> = {
  ugc_a_camara: "UGC a cámara",
  voz_en_off: "Voz en off / b-roll",
};

export const DESCRIPCION_FORMATO_CLIP: Record<FormatoClip, string> = {
  ugc_a_camara: "El personaje habla a cámara. Lo que escribas en el guion es lo que se le oirá decir.",
  voz_en_off:
    "Clip mudo: el personaje no habla y sale con la boca cerrada. La narración se monta encima al montar el vídeo.",
};

/** `true` cuando ese formato lleva diálogo. Es la condición que apaga la voz y el guion en el prompt. */
export const formatoHabla = (formato: FormatoClip): boolean => formato === "ugc_a_camara";

// ── Momento de la micro-acción ──────────────────────────────────────────────────────────────────────────

/**
 * Cuándo ocurre el gesto respecto al diálogo. Es lo que decide si va **delante** o **detrás** de la frase en el
 * prompt: los modelos de vídeo siguen el orden del texto como si fuera un guion técnico.
 */
export const MOMENTOS_MICROACCION = ["antes", "durante", "despues"] as const;
export type MomentoMicroaccion = (typeof MOMENTOS_MICROACCION)[number];

export const esMomentoMicroaccion = (v: unknown): v is MomentoMicroaccion =>
  MOMENTOS_MICROACCION.includes(v as MomentoMicroaccion);

export const NOMBRE_MOMENTO_MICROACCION: Record<MomentoMicroaccion, string> = {
  antes: "Antes de hablar",
  durante: "Mientras habla",
  despues: "Después de hablar",
};

// ── Nivel de la cámara ──────────────────────────────────────────────────────────────────────────────────

/**
 * Cómo de exigente es el movimiento de cámara. Es **informativo**: no cambia el prompt, avisa de cuánto se
 * arriesga el usuario a que el modelo no lo respete, que es lo que mide Jev con `direccion_fiel`.
 */
export const NIVELES_CAMARA = ["basico", "variacion", "avanzado"] as const;
export type NivelCamara = (typeof NIVELES_CAMARA)[number];

export const esNivelCamara = (v: unknown): v is NivelCamara => NIVELES_CAMARA.includes(v as NivelCamara);

export const NOMBRE_NIVEL_CAMARA: Record<NivelCamara, string> = {
  basico: "Básico",
  variacion: "Con variación",
  avanzado: "Avanzado",
};

export const AYUDA_NIVEL_CAMARA: Record<NivelCamara, string> = {
  basico: "Movimientos que el modelo respeta casi siempre.",
  variacion: "Movimientos que salen bien la mayoría de las veces.",
  avanzado: "Movimientos exigentes: mira el clip antes de darlo por bueno.",
};

// ── Acento ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Acento del habla, **elegido por proyecto** y no por escena (decisión firme del propietario, 2026-09-28): si
 * cada escena pudiera elegir, el acento cambiaría de plano a plano igual que cambiaba el timbre antes de la
 * 0.21.0.
 *
 * España peninsular es el de fábrica a propósito: las voces predefinidas del proveedor no declaran acento y, sin
 * pedirlo, salen con acento latinoamericano.
 */
export const ACENTOS = ["es_ES_madrid", "es_AR_rioplatense", "es_CO_bogota", "es_MX_cdmx", "es_419_neutro"] as const;
export type Acento = (typeof ACENTOS)[number];

export const esAcento = (v: unknown): v is Acento => ACENTOS.includes(v as Acento);

export const ACENTO_POR_DEFECTO: Acento = "es_ES_madrid";

export const NOMBRE_ACENTO: Record<Acento, string> = {
  es_ES_madrid: "España (peninsular neutro)",
  es_AR_rioplatense: "Rioplatense (Buenos Aires)",
  es_CO_bogota: "Colombiano (Bogotá)",
  es_MX_cdmx: "Mexicano (Ciudad de México)",
  es_419_neutro: "Latinoamericano neutro",
};

export const AYUDA_ACENTO =
  "Con qué acento habla el personaje en todas las escenas. Sin elegirlo, las voces del proveedor salen con acento latinoamericano.";

// ── Voz: los cinco ejes ─────────────────────────────────────────────────────────────────────────────────

/**
 * La voz se describe con cinco ejes y se fija **por personaje**, no por escena (decisión provisional del
 * propietario, 2026-09-28): es parte de quién es, como su cara. Cambiarla crea versión de personaje e invalida
 * su registro de voz en el proveedor, igual que cambiar la ficha invalida el registro de la cara.
 */
export const EJES_VOZ = ["genero", "edad", "gravedad", "textura", "entrega"] as const;
export type EjeVoz = (typeof EJES_VOZ)[number];

export const NOMBRE_EJE_VOZ: Record<EjeVoz, string> = {
  genero: "Género",
  edad: "Edad",
  gravedad: "Gravedad",
  textura: "Textura",
  entrega: "Entrega",
};

/** Valores que admite cada eje, en el orden en que se enseñan. El primero de cada uno es el de fábrica. */
export const VALORES_EJE_VOZ = {
  genero: ["femenina", "masculina", "neutra"],
  edad: ["joven", "adulta", "madura"],
  gravedad: ["media", "grave", "aguda"],
  textura: ["limpia", "calida", "rasgada", "susurrada"],
  entrega: ["conversacional", "energica", "pausada", "confidencial"],
} as const satisfies Record<EjeVoz, readonly string[]>;

export type ValorEjeVoz<E extends EjeVoz = EjeVoz> = (typeof VALORES_EJE_VOZ)[E][number];

/** Los cinco ejes de una voz. Siempre completos: una voz a medias suena distinta cada vez que se registra. */
export type EjesVoz = { [E in EjeVoz]: (typeof VALORES_EJE_VOZ)[E][number] };

export const EJES_VOZ_POR_DEFECTO: EjesVoz = {
  genero: "femenina",
  edad: "adulta",
  gravedad: "media",
  textura: "calida",
  entrega: "conversacional",
};

export const NOMBRE_VALOR_EJE_VOZ: Record<string, string> = {
  femenina: "Femenina",
  masculina: "Masculina",
  neutra: "Neutra",
  joven: "Joven",
  adulta: "Adulta",
  madura: "Madura",
  media: "Media",
  grave: "Grave",
  aguda: "Aguda",
  limpia: "Limpia",
  calida: "Cálida",
  rasgada: "Rasgada",
  susurrada: "Susurrada",
  conversacional: "Conversacional",
  energica: "Enérgica",
  pausada: "Pausada",
  confidencial: "Confidencial",
};

/**
 * Normaliza unos ejes venidos de la base de datos o del navegador: lo que no sea un valor conocido se cambia por
 * el de fábrica de ese eje. Nunca lanza, porque un personaje viejo sin ejes tiene que seguir produciendo.
 */
export function ejesVozDe(valor: unknown): EjesVoz {
  const entrada = (valor ?? {}) as Record<string, unknown>;
  const ejes = { ...EJES_VOZ_POR_DEFECTO };
  for (const eje of EJES_VOZ) {
    const admitidos = VALORES_EJE_VOZ[eje] as readonly string[];
    const elegido = entrada[eje];
    if (typeof elegido === "string" && admitidos.includes(elegido)) {
      (ejes as Record<string, string>)[eje] = elegido;
    }
  }
  return ejes;
}

/** Firma de unos ejes y un acento. Cambiar la firma es lo que invalida el registro de voz del proveedor. */
export const firmaDeVoz = (ejes: EjesVoz, acento: Acento, vozPresetId: string): string =>
  [...EJES_VOZ.map((eje) => `${eje}=${ejes[eje]}`), `acento=${acento}`, `preset=${vozPresetId}`].join("|");

// ── Registro estético ───────────────────────────────────────────────────────────────────────────────────

/**
 * Registro estético del fotograma, elegible por escena (decisión provisional del propietario, 2026-09-28).
 * Modula la cámara, la luz y los anclajes de realismo; **nunca** la identidad del personaje.
 */
export const REGISTROS_ESTETICOS = ["influencer", "ugc_real"] as const;
export type RegistroEstetico = (typeof REGISTROS_ESTETICOS)[number];

export const esRegistroEstetico = (v: unknown): v is RegistroEstetico =>
  REGISTROS_ESTETICOS.includes(v as RegistroEstetico);

export const NOMBRE_REGISTRO_ESTETICO: Record<RegistroEstetico, string> = {
  influencer: "Cuidado (estilo influencer)",
  ugc_real: "Real y cercano (UGC)",
};

export const DESCRIPCION_REGISTRO_ESTETICO: Record<RegistroEstetico, string> = {
  influencer: "Luz trabajada, encuadre limpio y acabado de campaña. La persona sigue siendo ella.",
  ugc_real: "Luz del sitio, cámara en mano y acabado de móvil, como un vídeo grabado sin pensarlo.",
};

// ── Modo «cambiar solo…» ────────────────────────────────────────────────────────────────────────────────

/**
 * Parte de un fotograma ya aprobado y cambia **una sola cosa**, dejando el resto literalmente igual. Es también
 * el mecanismo del antes/después: dos salidas de la misma imagen con un rasgo cambiado. No hay dos caminos
 * (decisión provisional del propietario, 2026-09-28).
 */
export const CAMBIOS_UNICOS = ["ninguno", "outfit", "localizacion", "pose"] as const;
export type CambioUnico = (typeof CAMBIOS_UNICOS)[number];

export const esCambioUnico = (v: unknown): v is CambioUnico => CAMBIOS_UNICOS.includes(v as CambioUnico);

export const NOMBRE_CAMBIO_UNICO: Record<CambioUnico, string> = {
  ninguno: "Nada: fotograma nuevo",
  outfit: "Solo la ropa",
  localizacion: "Solo el sitio",
  pose: "Solo la postura",
};

// ── Hoja de identidad 3×3 ───────────────────────────────────────────────────────────────────────────────

/**
 * Estado de la hoja de identidad (una imagen con nueve retratos del personaje). Nace **siempre** como
 * `candidata`: la hoja no sustituye a las vistas sueltas por decreto (decisión firme del propietario,
 * 2026-09-28), pasa a `por_defecto` solo si le gana a las vistas en la métrica de identidad y el propietario lo
 * aprueba.
 */
export const ESTADOS_HOJA_IDENTIDAD = ["candidata", "por_defecto", "descartada"] as const;
export type EstadoHojaIdentidad = (typeof ESTADOS_HOJA_IDENTIDAD)[number];

export const esEstadoHojaIdentidad = (v: unknown): v is EstadoHojaIdentidad =>
  ESTADOS_HOJA_IDENTIDAD.includes(v as EstadoHojaIdentidad);

export const NOMBRE_ESTADO_HOJA_IDENTIDAD: Record<EstadoHojaIdentidad, string> = {
  candidata: "Candidata (en pruebas)",
  por_defecto: "Referencia por defecto",
  descartada: "Descartada",
};

/** Retratos que lleva la hoja: tres filas de tres. */
export const RETRATOS_HOJA_IDENTIDAD = 9;

/**
 * Con qué referencia se generó un clip o un fotograma. Es el dato que permite comparar la hoja 3×3 con las
 * vistas sueltas: sin él, la comparación sería una impresión.
 */
export const REFERENCIAS_IDENTIDAD = ["vistas", "hoja_3x3"] as const;
export type ReferenciaIdentidad = (typeof REFERENCIAS_IDENTIDAD)[number];

export const esReferenciaIdentidad = (v: unknown): v is ReferenciaIdentidad =>
  REFERENCIAS_IDENTIDAD.includes(v as ReferenciaIdentidad);

export const NOMBRE_REFERENCIA_IDENTIDAD: Record<ReferenciaIdentidad, string> = {
  vistas: "Vistas sueltas",
  hoja_3x3: "Hoja de identidad 3×3",
};

/** Una rama de la comparación. `porcentaje` es `null` mientras no haya muestra suficiente para enseñarlo. */
export interface GrupoIdentidad {
  referencia: ReferenciaIdentidad;
  total: number;
  pasan: number;
  porcentaje: number | null;
}

/**
 * La comparación entre las dos referencias. `concluyente` es lo que separa un dato de una impresión: mientras
 * sea `false`, la pantalla enseña recuentos y **no** saca conclusiones.
 */
export interface ComparacionIdentidad {
  vistas: GrupoIdentidad;
  hoja: GrupoIdentidad;
  muestraMinima: number;
  concluyente: boolean;
  /** `true` si la hoja supera a las vistas **con muestra suficiente**. Proponerla no es ascenderla. */
  ganaLaHoja: boolean;
}

// ── Catálogo tal como lo ve el navegador ───────────────────────────────────────────────────────────────

/**
 * Una opción del catálogo, **sin su fragmento en inglés**. El prompt no sale hacia el navegador y sus piezas
 * tampoco (ADR-0022): lo que el usuario lee es el nombre y la descripción que escribió quien administra.
 */
export interface OpcionDireccion {
  clave: string;
  nombre: string;
  descripcion: string;
  /** Solo en la cámara: avisa de cuánto se arriesga a que el modelo no lo respete. */
  nivel?: NivelCamara;
  /** Solo en la micro-acción: el momento que propone el catálogo antes de que el usuario lo cambie. */
  momento?: MomentoMicroaccion;
}

/**
 * Las categorías que el usuario elige. Los anclajes no están: no son suyos.
 *
 * `accionProducto` (0.26.0) viaja con el resto porque se elige en el mismo panel: qué hace el personaje con el
 * producto es dirección del clip, igual que el gesto, y pedirlo en otra pantalla lo separaría de lo que
 * describe.
 */
export interface OpcionesDeDireccion {
  plano: OpcionDireccion[];
  angulo: OpcionDireccion[];
  optica: OpcionDireccion[];
  luz: OpcionDireccion[];
  localizacion: OpcionDireccion[];
  camara: OpcionDireccion[];
  microaccion: OpcionDireccion[];
  accionProducto: OpcionDireccion[];
}

// ── Texto libre del usuario ─────────────────────────────────────────────────────────────────────────────

/**
 * **Instrucciones adicionales**: lo que el usuario escribe en castellano y se suma a lo que ha elegido con
 * botones, sin quitarle nada. Entra en el prompt **en su sitio** —junto a la descripción de la escena, después
 * del sujeto y antes del gesto— y pasa por la misma limpieza anti-inyección que el resto del texto libre.
 *
 * Corta a propósito: es un añadido a lo elegido, no una descripción alternativa. Para eso está el modo experto.
 */
export const INSTRUCCIONES_EXTRA_MAXIMAS = 400;

/**
 * **Modo experto**: el usuario escribe la descripción entera en castellano y los botones de dirección dejan de
 * aplicarse. Lo que **no** se puede quitar y se sigue aplicando siempre: la regla de toma única, los anclajes de
 * realismo y, con una persona real, la prohibición de retocarla.
 *
 * El acento y la voz siguen siendo suyos: no describen la imagen, describen quién habla.
 */
export const DESCRIPCION_EXPERTA_MAXIMA = 1200;

export const AYUDA_INSTRUCCIONES_EXTRA =
  "En castellano, lo que quieras añadir a lo que has elegido arriba. No sustituye a nada: se suma.";

export const AYUDA_MODO_EXPERTO =
  "Escribes tú la descripción entera del clip y los botones de dirección dejan de aplicarse. El acento y la voz siguen siendo los que elijas.";

export const AVISO_MODO_EXPERTO =
  "En modo experto mandas tú: el plano, el ángulo, el movimiento y el gesto que elijas arriba no se le envían al modelo. Lo que no se quita nunca: una sola toma sin cortes, los anclajes de realismo y, si el personaje es una persona real, la prohibición de retocarla.";

// ── Lo que el usuario ha elegido ────────────────────────────────────────────────────────────────────────

/**
 * **La dirección elegida**, tal como viaja entre el navegador y el servidor: claves del catálogo y enumerados,
 * nunca el texto que se le envía al modelo (ADR-0022). El servidor la traduce a fragmentos en inglés con su
 * propio catálogo, así que un cliente no puede colar texto suyo en el prompt por este camino.
 *
 * Es la misma forma en los dos sitios donde se dirige un clip: la escena de un proyecto, que la guarda en su
 * fila, y «Crear», que la manda con la confirmación del clip. Una sola definición para los dos.
 */
export interface DireccionElegida {
  formatoClip: FormatoClip;
  plano: string;
  angulo: string;
  camara: string;
  microaccion: string;
  momentoMicroaccion: MomentoMicroaccion;
  /** Matiz corto de la voz, en castellano. El servidor lo traduce con el resto del texto libre. */
  direccionVocal: string;
  optica: string;
  luz: string;
  localizacion: string;
  registroEstetico: RegistroEstetico;
  /** Lo que el usuario añade por escrito, en castellano. Se suma a lo elegido con botones. */
  instruccionesExtra: string;
  /** `true` cuando el usuario escribe la descripción entera y los botones dejan de aplicarse. */
  modoExperto: boolean;
  /** La descripción entera del modo experto, en castellano. Se ignora con `modoExperto` en `false`. */
  descripcionExperta: string;
}

/** Sin dirigir: es con lo que nacen las escenas y lo que producían las versiones anteriores. */
export const DIRECCION_ELEGIDA_VACIA: DireccionElegida = {
  formatoClip: "ugc_a_camara",
  plano: "",
  angulo: "",
  camara: "",
  microaccion: "",
  momentoMicroaccion: "durante",
  direccionVocal: "",
  optica: "",
  luz: "",
  localizacion: "",
  registroEstetico: "ugc_real",
  instruccionesExtra: "",
  modoExperto: false,
  descripcionExperta: "",
};

/**
 * La dirección con su acento. En un proyecto el acento es del proyecto entero y no de la escena; en «Crear» no
 * hay proyecto, así que se elige con el resto del clip y viaja con él.
 */
export interface DireccionElegidaConAcento extends DireccionElegida {
  acento: Acento;
}

export const DIRECCION_CON_ACENTO_VACIA: DireccionElegidaConAcento = {
  ...DIRECCION_ELEGIDA_VACIA,
  acento: ACENTO_POR_DEFECTO,
};

// ── Avisos de la dirección ──────────────────────────────────────────────────────────────────────────────

/**
 * Un solo movimiento de cámara por clip (decisión provisional del propietario, 2026-09-28): las guías de Veo y
 * de Kling coinciden en que dos movimientos en un plano dan un plano partido. Cuando el usuario pide dos, se le
 * avisa y se le ofrece partir la escena; **no se envían juntos**.
 */
export const AVISO_DOS_MOVIMIENTOS =
  "Has elegido dos movimientos de cámara para el mismo clip y el modelo solo respeta uno: se enviará el primero. Si quieres los dos, parte la escena en dos y pon un movimiento en cada una.";

/** Lo que se le dice al usuario cuando su formato es mudo pero ha escrito guion. */
export const AVISO_GUION_EN_CLIP_MUDO =
  "Este clip es de voz en off, así que el personaje sale con la boca cerrada y el guion no se le envía al modelo: se usará al montar la narración encima.";

/**
 * Palabras por segundo de habla natural en castellano. Sirve para estimar si la frase cabe en el clip, que es
 * lo único que decide si hay hueco para un gesto antes o después de hablar.
 */
export const PALABRAS_POR_SEGUNDO = 2.5;

/** Lo que ocupa un gesto corto (asentir, sonreír) fuera del habla. */
export const SEGUNDOS_DE_GESTO = 0.8;

/**
 * `true` cuando el gesto **no cabe** fuera del diálogo en un clip de esa duración.
 *
 * Sale del spike del 2026-09-28: con una frase de dieciséis palabras en un clip de 4 s, el personaje habla de
 * principio a fin y no queda hueco para asentir antes ni después. No es un fallo del modelo, es aritmética, y
 * por eso se avisa en vez de prometer un gesto que no va a caber.
 */
export const gestoNoCabe = (palabras: number, segundos: number): boolean =>
  palabras / PALABRAS_POR_SEGUNDO + SEGUNDOS_DE_GESTO > segundos;

/**
 * Aviso del gesto **antes de hablar**, medido el 2026-09-28 (segundo spike, 8 s).
 *
 * Con hueco de sobra —una frase de dieciséis palabras en un clip de 8 s— el modelo **empieza a hablar en el
 * primer fotograma** y deja el silencio al final. El «antes» no se respeta; el «después» sí, porque coincide
 * con dónde el modelo deja el hueco. Se dice en vez de prometerlo: el usuario puede elegirlo igual, pero
 * sabiendo qué va a pasar.
 */
export const AVISO_GESTO_ANTES_POCO_FIABLE =
  "El modelo empieza a hablar nada más arrancar el clip, así que un gesto «antes de hablar» casi nunca sale donde lo pides: suele acabar mientras habla. «Después de hablar» sí se respeta.";

export const avisoGestoNoCabe = (segundos: number): string =>
  `La frase ocupa casi todo el clip de ${segundos} s, así que no queda hueco para el gesto antes ni después de hablar: saldrá mientras habla. Acorta el guion o alarga el clip si lo quieres separado.`;

/** Lo que se le dice cuando pide un movimiento avanzado. No lo impide: lo avisa. */
export const AVISO_MOVIMIENTO_AVANZADO =
  "Este movimiento de cámara es exigente y el modelo no siempre lo respeta. Mira el clip antes de darlo por bueno.";

// ── Direcciones guardadas ───────────────────────────────────────────────────────────────────────────────

/**
 * **Una dirección guardada con nombre**: lo que el usuario eligió una vez y quiere volver a usar sin
 * reconstruirlo botón a botón. Es suya y solo suya; compartirlas es otra cosa y no está en esta versión.
 *
 * Guarda **claves del catálogo y texto limpio**, igual que lo que viaja al confirmar un clip: aquí no hay ni
 * una palabra del prompt en inglés (ADR-0022). Recuperarla rellena los controles y **no genera nada**.
 */
export interface DireccionGuardada {
  id: string;
  nombre: string;
  direccion: DireccionElegidaConAcento;
  /** Cuándo se guardó o se renombró por última vez, en ISO. */
  actualizada: string;
}

export const NOMBRE_DIRECCION_MAXIMO = 60;

/** Las categorías del catálogo que la dirección guarda por clave, con el rótulo que el usuario leyó. */
const CAMPOS_DE_CATALOGO = [
  ["plano", "Plano"],
  ["angulo", "Ángulo"],
  ["camara", "Movimiento de cámara"],
  ["microaccion", "Micro-acción"],
  ["optica", "Óptica"],
  ["luz", "Luz"],
  ["localizacion", "Sitio"],
] as const satisfies readonly (readonly [keyof OpcionesDeDireccion, string])[];

/** Lo que sale de aplicar una dirección guardada: lo que se pone en los controles y lo que se ha caído. */
export interface DireccionAplicada {
  direccion: DireccionElegidaConAcento;
  /** Rótulos de las opciones que ya no existen en el catálogo. Vacío = se ha aplicado entera. */
  ignoradas: string[];
  /** Lo que se le dice al usuario, en castellano. Vacío cuando no se ha ignorado nada. */
  aviso: string;
}

/**
 * Aplica una dirección guardada contra el catálogo de **ahora**.
 *
 * Quien administra puede desactivar una opción después de que alguien la guardara. Esa clave no se envía como
 * si nada —el servidor la trataría como «no elegido» y el usuario creería haber pedido algo que no pidió— ni
 * bloquea la dirección entera: **se ignora y se avisa**, que es lo único honesto.
 *
 * Es una función pura: el mismo catálogo y la misma dirección dan siempre el mismo resultado.
 */
export function aplicarDireccionGuardada(
  guardada: DireccionElegidaConAcento,
  opciones: OpcionesDeDireccion,
): DireccionAplicada {
  const direccion = { ...guardada };
  const ignoradas: string[] = [];
  for (const [campo, rotulo] of CAMPOS_DE_CATALOGO) {
    const clave = guardada[campo];
    if (clave === "") continue;
    if (opciones[campo].some((opcion) => opcion.clave === clave)) continue;
    direccion[campo] = "";
    ignoradas.push(rotulo);
  }
  return {
    direccion,
    ignoradas,
    aviso:
      ignoradas.length === 0
        ? ""
        : `Esta dirección se guardó con opciones que ya no están en el catálogo (${ignoradas.join(", ")}): se han dejado sin elegir. Elige otras antes de generar.`,
  };
}
