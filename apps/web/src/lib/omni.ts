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

/**
 * Modelos de vídeo que saben producir una **escena hablada**, es decir, que aceptan `character_ids` y una voz
 * registrada, **en orden de preferencia**.
 *
 * Esto no es el catálogo: el catálogo dice qué modelos hay, en qué estado están y cuánto cuestan, y es él quien
 * decide si uno se puede usar. Lo que dice esta lista es **para cuáles sabe montar la entrada esta instalación**
 * (`kie/entradas.ts`), que es una propiedad del código y no de los datos: un modelo del catálogo sin constructor
 * no se puede enviar. De los que estén utilizables se coge el primero de esta lista.
 *
 * Gemini Omni 1.1 Flash es el predeterminado desde la 0.22.0 (decisión firme del propietario, 2026-09-28):
 * medido con dinero real ese día, cuesta lo mismo que `gemini-omni-video` —63 créditos por 4 s en 9:16 a 720p—
 * y tarda **38 s en lugar de 59 s**, con el diálogo en español igual de exacto.
 */
export const MODELOS_OMNI = [
  "google/gemini-omni-flash-1-1",
  "gemini-omni-video",
  "minimax-h3/reference-to-video",
] as const;

/**
 * Modelos que hablan citando una **identidad registrada** en el proveedor (`character_ids`). Los demás de la
 * lista hablan con **referencias**: la cara sale de las fotos del personaje y la voz, de una muestra de la voz
 * del proyecto, así que no hay nada que registrar pero sí que enviar en cada clip.
 *
 * Es la diferencia que decide qué hace falta antes de producir, y por eso vive aquí y no en una condición
 * suelta: con identidad registrada hace falta el registro; con referencias, la voz del mapa y su muestra.
 */
export const MODELOS_CON_IDENTIDAD_REGISTRADA = ["google/gemini-omni-flash-1-1", "gemini-omni-video"] as const;

export const usaIdentidadRegistrada = (modelo: string): boolean =>
  MODELOS_CON_IDENTIDAD_REGISTRADA.includes(modelo as (typeof MODELOS_CON_IDENTIDAD_REGISTRADA)[number]);

/**
 * Modelos con los que **se ha producido de verdad** una escena con dos personajes registrados (podcast y
 * dualcast). Solo Gemini Omni 1.1 Flash: el spike del 2026-09-29 sacó con él los tres clips (63 créditos cada uno,
 * con uno o con dos `character_ids`).
 *
 * `gemini-omni-video` documenta `character_ids`, pero nunca ha terminado un clip con ellos: el 2026-10-18, el mismo
 * dualcast falló dos veces seguidas en KIE con «fallo interno» y sin cobro, con una petición idéntica a la que sí
 * funciona en 1.1 Flash. Mandárselo otra vez sería apostar a ciegas, así que el reparto no se ofrece con él.
 */
export const MODELOS_CON_REPARTO_MEDIDO = ["google/gemini-omni-flash-1-1"] as const;

/** `true` si con ese modelo se ha producido de verdad una escena con dos personajes registrados. */
export const tieneRepartoMedido = (modelo: string): boolean =>
  MODELOS_CON_REPARTO_MEDIDO.includes(modelo as (typeof MODELOS_CON_REPARTO_MEDIDO)[number]);

/** Lo que dice de sí mismo, en el selector de las Opciones avanzadas, el modelo validado con dos personas. */
export const ETIQUETA_REPARTO_MEDIDO = "Validado con dos personas";

/**
 * Por qué ese modelo no puede producir una escena con dos personajes, en llano; `null` si puede. Es el mismo texto
 * en la estimación y al confirmar el gasto, para que la pantalla no prometa lo que el servidor va a rechazar.
 *
 * No nombra ningún modelo (se lee fuera de las Opciones avanzadas): dice dónde elegir el que sirve y cómo
 * reconocerlo, porque en el selector ese modelo lleva la etiqueta {@link ETIQUETA_REPARTO_MEDIDO}.
 */
export function motivoSinReparto(modelo: { modelo: string; nombre: string }): string | null {
  if (tieneRepartoMedido(modelo.modelo)) return null;
  const como = `Para el podcast y el dualcast, elige en las Opciones avanzadas del proyecto el modelo marcado «${ETIQUETA_REPARTO_MEDIDO}» (o ponlo el primero de la lista de vídeo de tu mapa de modelos, en «Tu cuenta»).`;
  if (!usaIdentidadRegistrada(modelo.modelo)) {
    return `El modelo de escenas habladas que usas no admite identidades registradas, y el podcast y el dualcast las necesitan. No se ha cobrado nada. ${como}`;
  }
  return `El modelo de escenas habladas que usas no consigue generar con dos personajes registrados: en KIE da un fallo interno y no cobra. ${como}`;
}

/**
 * Duración con la que se midió el precio de cada motor de escenas habladas. Lo que no esté aquí se estima con
 * su propio precio registrado tal cual, sin escalar: inventar una proporción sobre algo no medido sería peor
 * que no estimarlo.
 */
export const SEGUNDOS_MEDIDOS_POR_MODELO: Record<string, number> = {
  "google/gemini-omni-flash-1-1": 4,
  "gemini-omni-video": 4,
  "minimax-h3/reference-to-video": 5,
};

export const esModeloOmni = (modelo: string): boolean => MODELOS_OMNI.includes(modelo as (typeof MODELOS_OMNI)[number]);

/**
 * Coloca los modelos de escenas habladas **en el orden de preferencia de `MODELOS_OMNI`**, sin mover nada más: cada
 * modelo Omni ocupa uno de los huecos que ya ocupaban los Omni, y el resto se queda donde estaba.
 *
 * Hace falta en la recomendación que se deduce del catálogo, que ordena por nombre: «Gemini Omni (vídeo)» va antes
 * que «Gemini Omni 1.1 Flash (vídeo)» porque «(» va antes que «1», y una cuenta sin mapa propio acababa hablando con
 * `gemini-omni-video` en lugar de con el recomendado.
 */
export function conPreferenciaOmni<T extends { modelo: string }>(modelos: readonly T[]): T[] {
  const orden = (m: T) => MODELOS_OMNI.indexOf(m.modelo as (typeof MODELOS_OMNI)[number]);
  const omni = modelos.filter((m) => esModeloOmni(m.modelo)).sort((a, b) => orden(a) - orden(b));
  let siguiente = 0;
  return modelos.map((m) => (esModeloOmni(m.modelo) ? (omni[siguiente++] ?? m) : m));
}

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

// ── Voz de cada personaje ────────────────────────────────────────────────────────────────────────────────────

/**
 * Voz registrada con la que habla un personaje: **la suya** si la tiene y, si no, la del proyecto. Es lo que se cita
 * al registrarlo en el proveedor (la voz viaja dentro del personaje registrado) y lo que distingue un registro
 * vigente de uno hecho con otra voz.
 */
export const audioIdEfectivo = (propio: string, delProyecto: string): string => (propio !== "" ? propio : delProyecto);

/** Alguien de una conversación, con su voz propia (vacía si no la tiene). */
export interface HablanteConVoz {
  personajeId: string;
  nombre: string;
  audioIdPropio: string;
}

/**
 * Qué le falta de voz a `quien` para hablar en una conversación con `otros`, o vacío si nada.
 *
 * - sin voz propia ni voz del proyecto, no tiene con qué voz registrarse;
 * - sin voz propia, habla con la del proyecto: si otro de la conversación también, **sonarían igual**. Al
 *   protagonista se le deja la del proyecto (es la de siempre) y el aviso va al otro, que es quien tiene que elegir
 *   la suya. Si ninguno es el protagonista, el aviso va a los dos.
 */
export function faltaDeVoz(
  quien: HablanteConVoz,
  otros: readonly HablanteConVoz[],
  audioIdDelProyecto: string,
  protagonistaId: string | null,
): string {
  const propia = quien.audioIdPropio;
  if (audioIdEfectivo(propia, audioIdDelProyecto) === "") {
    return "no tiene ninguna voz registrada: elige y registra su voz en su ficha, o la del proyecto en «Voz y subtítulos». No cuesta créditos.";
  }
  if (propia !== "" || quien.personajeId === protagonistaId) return "";
  const igual = otros.find(
    (o) =>
      o.personajeId !== quien.personajeId &&
      audioIdEfectivo(o.audioIdPropio, audioIdDelProyecto) === audioIdDelProyecto,
  );
  if (!igual) return "";
  return `no tiene voz propia y sonaría con la misma voz que «${igual.nombre}». Elige y registra su voz en su ficha («Su voz en las escenas habladas»): no cuesta créditos, y queda registrado con ella.`;
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

/** Duración con la que se midió el precio del motor recomendado: 4 s en 9:16 a 720p, 63 créditos el 2026-09-28. */
export const SEGUNDOS_PRECIO_OMNI_MEDIDO = 4;

/** Segundos medidos de ese modelo; los del recomendado cuando el modelo no declara los suyos. */
export const segundosMedidosDe = (modelo: string): number =>
  SEGUNDOS_MEDIDOS_POR_MODELO[modelo] ?? SEGUNDOS_PRECIO_OMNI_MEDIDO;

/**
 * Créditos de una escena hablada de `segundos` a partir del precio registrado de **ese** modelo.
 *
 * Cada motor tiene su duración medida (4 s en Gemini Omni Flash, 5 s en MiniMax H3) y las demás se estiman en
 * proporción, marcadas como estimadas en la pantalla (decisión provisional del propietario, 2026-09-28). Nunca
 * baja del precio registrado: ningún proveedor cobra menos que su mínimo por llamada, y estimar por debajo sería
 * prometer un precio que no existe.
 */
export function creditosDeEscenaOmni(creditosRegistrados: number, segundos: number, modelo = ""): number {
  if (!(segundos > 0)) return Math.ceil(creditosRegistrados);
  const proporcional = (creditosRegistrados * segundos) / segundosMedidosDe(modelo);
  return Math.max(Math.ceil(creditosRegistrados), Math.ceil(proporcional));
}

/** `true` cuando el precio de esa duración es una estimación y no una medida. Se dice en la pantalla. */
export const precioOmniEstimado = (segundos: number, modelo = ""): boolean => segundos !== segundosMedidosDe(modelo);

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

/**
 * **Retratos que se pueden pedir de una vez**: los candidatos, sin pasar del tope de trabajos simultáneos de la
 * instalación (con tres a la vez, como mucho tres). Es el máximo del selector y el número que dicen los textos, para
 * que nunca se prometan más de los que se pueden encargar. Sin tope conocido, los candidatos.
 */
export const retratosPorEncargo = (trabajosSimultaneos: number | null): number =>
  trabajosSimultaneos === null ? RETRATOS_CANDIDATOS : Math.max(1, Math.min(RETRATOS_CANDIDATOS, trabajosSimultaneos));

const CIFRAS_EN_PALABRAS = ["cero", "uno", "dos", "tres", "cuatro"];

/** «tres retratos», «un retrato». */
export const retratosEnPalabras = (n: number): string =>
  n === 1 ? "un retrato" : `${CIFRAS_EN_PALABRAS[n] ?? n} retratos`;

/** «de uno a tres retratos», o «un retrato» si solo se puede uno. */
export const rangoDeRetratos = (n: number): string =>
  n === 1 ? "un retrato" : `de uno a ${CIFRAS_EN_PALABRAS[n] ?? n} retratos`;
