/**
 * Escenas habladas con Gemini Omni: voz registrada y personaje registrado (RF02, RF06, RF08 y RF10, 0.22.0).
 *
 * Lo que comparten el servidor y el navegador. Aquí no hay secretos, no hay credenciales y no se llama a nadie:
 * solo la forma de los datos, los límites que declara el proveedor y los textos que las dos partes tienen que
 * decir igual.
 *
 * **Por qué existe este modo.** En modo `clip` cada escena se genera por su cuenta, así que la cara y el timbre
 * cambian de plano a plano; en modo `pista` la voz es la misma pero los labios no cuadran porque el audio se pega
 * después. Gemini Omni registra **una vez** la cara y la voz en el proveedor y devuelve un `characterId`: todas
 * las escenas que lo citan salen con la misma cara, la misma voz y los labios sincronizados. Medido con dinero
 * real el 2026-09-28: dos escenas distintas con el mismo `character_ids` dieron la misma cara y el diálogo en
 * español exacto.
 *
 * Los dos registros (voz y personaje) **no cuestan créditos** —comprobado el 2026-09-28 con la clave del
 * propietario—, pero se hacen con la credencial del usuario y envían su cara al proveedor, así que pasan por el
 * consentimiento y quedan registrados con su cuenta y su fecha.
 */

/** Modelo de vídeo con el que se producen las escenas habladas. Lo declara el catálogo; aquí solo se nombra. */
export const MODELO_OMNI = "gemini-omni-video";

/** Límites de los dos registros, tal como los documenta KIE (docs.kie.ai, comprobado el 2026-09-28). */
export const NOMBRE_VOZ_OMNI_MAXIMO = 210;
export const DESCRIPCION_VOZ_OMNI_MAXIMA = 20_000;
export const EJEMPLO_VOZ_OMNI_MAXIMO = 120;
/** Descripción del personaje que se envía al registrarlo. El límite es el del prompt del propio modelo. */
export const DESCRIPCION_PERSONAJE_OMNI_MAXIMA = 20_000;

/**
 * Descripción mínima de la voz: sin ella, el proveedor pone el acento que quiera. No es una validación del
 * proveedor, es una regla del producto: una voz sin describir suena distinta cada vez que se registra.
 */
export const DESCRIPCION_VOZ_OMNI_MINIMA = 10;

/**
 * Descripción de la voz que se propone de fábrica. Español **de España** a propósito: las treinta voces
 * predefinidas no declaran acento, y sin pedirlo salen con acento latinoamericano (riesgo de la fase 22). El
 * propietario la valida al escucharla.
 */
export const DESCRIPCION_VOZ_OMNI_POR_DEFECTO =
  "Voz natural en español de España, acento peninsular, tono cercano y conversacional, sin locución publicitaria.";

/** Frase de ejemplo de fábrica: corta, en español y sin nombres propios. Cabe en los 120 caracteres del campo. */
export const EJEMPLO_VOZ_OMNI_POR_DEFECTO = "Hola, así suena mi voz cuando cuento algo que me importa.";

/**
 * Las treinta voces predefinidas de `omni/audio/create`, con el género y el tono que publica
 * docs.kie.ai/market/gemini-omni-audio (comprobado el 2026-09-28). El identificador es lo que viaja en
 * `audio_id`; **quien lo valida es el proveedor**, no esta lista, pero ofrecer una que no existe sería ofrecer un
 * error.
 *
 * El género va en el dato y no solo en el texto porque la interfaz agrupa por él: treinta nombres de estrellas
 * seguidos no ayudan a elegir.
 */
export const GENEROS_VOZ_OMNI = ["femenina", "masculina"] as const;
export type GeneroVozOmni = (typeof GENEROS_VOZ_OMNI)[number];

export interface VozOmniOfrecida {
  id: string;
  /** Nombre que publica el proveedor (son nombres de estrellas). Es lo único que se enseña. */
  nombre: string;
  genero: GeneroVozOmni;
  /** Tono tal como lo describe el proveedor. */
  tono: string;
}

export const VOCES_OMNI: readonly VozOmniOfrecida[] = [
  { id: "achernar", nombre: "Achernar", genero: "femenina", tono: "Suave" },
  { id: "achird", nombre: "Achird", genero: "masculina", tono: "Amable" },
  { id: "algenib", nombre: "Algenib", genero: "masculina", tono: "Grave y rasgada" },
  { id: "algieba", nombre: "Algieba", genero: "masculina", tono: "Tersa" },
  { id: "alnilam", nombre: "Alnilam", genero: "masculina", tono: "Firme" },
  { id: "aoede", nombre: "Aoede", genero: "femenina", tono: "Ligera" },
  { id: "autonoe", nombre: "Autonoe", genero: "femenina", tono: "Luminosa" },
  { id: "callirrhoe", nombre: "Callirrhoe", genero: "femenina", tono: "Tranquila" },
  { id: "charon", nombre: "Charon", genero: "masculina", tono: "Informativa" },
  { id: "despina", nombre: "Despina", genero: "femenina", tono: "Tersa" },
  { id: "enceladus", nombre: "Enceladus", genero: "masculina", tono: "Susurrada" },
  { id: "erinome", nombre: "Erinome", genero: "femenina", tono: "Clara" },
  { id: "fenrir", nombre: "Fenrir", genero: "masculina", tono: "Excitable" },
  { id: "gacrux", nombre: "Gacrux", genero: "femenina", tono: "Adulta" },
  { id: "iapetus", nombre: "Iapetus", genero: "masculina", tono: "Despejada" },
  { id: "kore", nombre: "Kore", genero: "femenina", tono: "Firme" },
  { id: "laomedeia", nombre: "Laomedeia", genero: "femenina", tono: "Animada" },
  { id: "leda", nombre: "Leda", genero: "femenina", tono: "Juvenil" },
  { id: "orus", nombre: "Orus", genero: "masculina", tono: "Firme" },
  { id: "puck", nombre: "Puck", genero: "masculina", tono: "Optimista" },
  { id: "pulcherrima", nombre: "Pulcherrima", genero: "femenina", tono: "Directa" },
  { id: "rasalgethi", nombre: "Rasalgethi", genero: "masculina", tono: "Informativa" },
  { id: "sadachbia", nombre: "Sadachbia", genero: "masculina", tono: "Despierta" },
  { id: "sadaltager", nombre: "Sadaltager", genero: "masculina", tono: "Documentada" },
  { id: "schedar", nombre: "Schedar", genero: "masculina", tono: "Regular" },
  { id: "sulafat", nombre: "Sulafat", genero: "femenina", tono: "Cálida" },
  { id: "umbriel", nombre: "Umbriel", genero: "masculina", tono: "Apacible" },
  { id: "vindemiatrix", nombre: "Vindemiatrix", genero: "femenina", tono: "Amable" },
  { id: "zephyr", nombre: "Zephyr", genero: "femenina", tono: "Brillante" },
  { id: "zubenelgenubi", nombre: "Zubenelgenubi", genero: "masculina", tono: "Coloquial" },
];

export const esVozOmni = (v: unknown): v is string => VOCES_OMNI.some((voz) => voz.id === v);

export const nombreDeVozOmni = (id: string): string => VOCES_OMNI.find((v) => v.id === id)?.nombre ?? id;

/**
 * Voz Omni ya registrada en el proveedor para un proyecto. `audioId` es lo que se cita al registrar el personaje,
 * y es lo que hace que todas sus escenas suenen igual.
 */
export interface VozOmniDelProyecto {
  /** Una de las treinta voces predefinidas. */
  voz: string;
  descripcion: string;
  ejemplo: string;
  /** Identificador que devolvió el proveedor. Sin él, el registro no existe. */
  audioId: string;
  /** Cuándo se registró. Es la fecha que explica por qué lo anterior quedó invalidado. */
  registradaEn: string;
}

/**
 * Registro Omni de **una versión de la ficha** de un personaje. Cambiar la ficha crea versión nueva y obliga a
 * registrar otra vez: lo que se envió al proveedor era la ficha anterior, y la cara del registro es la de
 * entonces.
 */
export interface RegistroOmniVista {
  /** Número de la versión de la ficha con la que se registró. */
  versionNumero: number;
  /** `true` cuando esa versión es la vigente del personaje: si no, hay que volver a registrar. */
  vigente: boolean;
  /** Voz Omni con la que se registró; vacío si se registró sin voz (no ocurre en 0.22.0). */
  audioId: string;
  registradoEn: string;
  /** Retrato que se envió, ya en la biblioteca del usuario. */
  retratoMedioId: string | null;
}

// ── Precio ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Duraciones que admite `gemini-omni-video` en su campo `duration`, que viaja **como texto**. */
export const DURACIONES_OMNI = [4, 6, 8, 10] as const;
export type DuracionOmni = (typeof DURACIONES_OMNI)[number];

export const esDuracionOmni = (v: unknown): v is DuracionOmni => DURACIONES_OMNI.includes(v as DuracionOmni);

/** Duración con la que se midió el precio: 4 s en 9:16 a 720p costaron 63 créditos el 2026-09-28. */
export const SEGUNDOS_PRECIO_OMNI_MEDIDO = 4;

/**
 * Créditos de una escena Omni de `segundos` a partir del precio registrado del modelo.
 *
 * Solo los 4 s están **medidos**; 6, 8 y 10 se estiman proporcionales y la interfaz los marca como estimados
 * (decisión provisional del propietario, 2026-09-28). Nunca baja del precio registrado: ningún proveedor cobra
 * menos que su mínimo por llamada, y estimar por debajo sería prometer un precio que no existe.
 */
export function creditosDeEscenaOmni(creditosRegistrados: number, segundos: number): number {
  if (!(segundos > 0)) return Math.ceil(creditosRegistrados);
  const proporcional = (creditosRegistrados * segundos) / SEGUNDOS_PRECIO_OMNI_MEDIDO;
  return Math.max(Math.ceil(creditosRegistrados), Math.ceil(proporcional));
}

/** `true` cuando el precio de esa duración es una estimación y no una medida. Se dice en la pantalla. */
export const precioOmniEstimado = (segundos: number): boolean => segundos !== SEGUNDOS_PRECIO_OMNI_MEDIDO;

// ── Textos que las dos partes dicen igual ────────────────────────────────────────────────────────────────────

/**
 * Qué sale hacia el proveedor al **registrar** un personaje en Omni. Se dice en el consentimiento, porque
 * registrar la cara de una persona real es enviar su imagen al proveedor y dejarla alojada allí con un
 * identificador (decisión provisional del propietario, 2026-09-28).
 */
export const AVISO_REGISTRO_OMNI =
  "Al registrar este personaje para escenas habladas se envían a KIE su mejor retrato (y su vista de cuerpo entero, si la hay) y el texto de su ficha. KIE guarda esa imagen con un identificador propio y la reutiliza en cada escena que cite al personaje, así que la cara queda alojada en el proveedor hasta que se deje de usar.";

/** Declaración que se guarda al crear un personaje inventado, con la cuenta y la fecha. */
export const DECLARACION_PERSONAJE_INVENTADO =
  "Declaro que es un personaje inventado y que no representa a ninguna persona real.";

/**
 * Por qué un personaje inventado no admite fotos: si admitiera una foto real, «inventado» dejaría de significar
 * nada y la declaración sería falsa sin que nadie lo notara.
 */
export const MOTIVO_SIN_FOTOS_REALES =
  "Este personaje es inventado, así que no admite fotos reales ni subidas ni de tu biblioteca: sus vistas salen del retrato generado. Si quieres usar fotos de una persona, crea un personaje con su consentimiento.";

/** Retratos candidatos que se generan al crear un personaje inventado. Se elige uno y los demás se descartan. */
export const RETRATOS_CANDIDATOS = 4;
