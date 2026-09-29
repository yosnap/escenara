import { eq } from "drizzle-orm";
import { ETIQUETA_AUTORIZO_PARECIDO } from "@/lib/personajes";
import { declaraCoherencia } from "../coherencia/identidad";
import { percibir } from "../coherencia/percepcion";
import { db } from "../db/cliente";
import { characterReferences, characters } from "../db/esquema";
import type { ImagenParaChat } from "../proveedores/compatible/cliente";

/**
 * **Extracción de las 6C desde una foto de referencia** (decisión provisional del propietario, 2026-09-28).
 *
 * El usuario sube una foto que le gusta, la percepción de la 0.24.0 la describe y de ahí salen los campos C2
 * (cámara), C3 (ropa), C4 (contexto) y C5 (luz) **ya rellenos y editables**. No se genera nada hasta que el
 * usuario los confirma: lo que un modelo cree ver no es lo que el usuario quiere pedir, y darlo por bueno sin
 * mirarlo sería gastarle el dinero en la interpretación de otro.
 *
 * **C1 no se extrae.** La identidad sale de las referencias del personaje. Pedirle a un modelo que describa a
 * la persona de una foto sería exactamente el juicio de atractivo que la decisión de identidad prohíbe, y
 * además no serviría: el personaje ya tiene su cara.
 *
 * Coste: el mismo que la percepción de la 0.24.0, es decir, **cero créditos**. Recorre el mapa de servicios
 * compatibles del usuario, que se pagan por cuota del plan.
 */

/** Las cuatro C que se pueden leer de una foto, tal como se le enseñan al usuario para que las corrija. */
export interface SeisCExtraidas {
  camara: string;
  ropa: string;
  contexto: string;
  luz: string;
}

/** Lo extraído, con la constancia de que **todavía no está confirmado**. */
export interface ExtraccionDeReferencia {
  campos: SeisCExtraidas;
  /** Hechos completos tal como los describió el modelo. Es lo que se guarda como evidencia de la extracción. */
  hechos: string;
  proveedor: string;
  modelo: string;
  /**
   * Siempre `false` al salir de aquí. Lo pone a `true` quien recibe la confirmación del usuario, y **sin eso no
   * se genera**: es la puerta de «revisar antes de pagar».
   */
  confirmada: boolean;
  /** Campos que el modelo no supo leer. Se le dicen al usuario para que los escriba él. */
  sinLeer: (keyof SeisCExtraidas)[];
}

/** Etiqueta con la que responde el modelo y campo al que va. El orden es el de las instrucciones. */
const CAMPO_POR_ETIQUETA: Record<string, keyof SeisCExtraidas> = {
  CAMERA: "camara",
  WARDROBE: "ropa",
  CONTEXT: "contexto",
  LIGHT: "luz",
};

/** Largo máximo de cada campo. Un campo que no cabe en la pantalla no se puede revisar. */
const CAMPO_MAXIMO = 400;

/**
 * Parte la respuesta en campos. Es tolerante a propósito: el modelo puede saltarse una línea, cambiar el orden
 * o añadir un guion delante, y perder la extracción entera por eso obligaría al usuario a repetirla. Lo que no
 * hace es inventar: lo que no venga se devuelve vacío y se dice en `sinLeer`.
 */
export function camposDeLaRespuesta(texto: string): { campos: SeisCExtraidas; sinLeer: (keyof SeisCExtraidas)[] } {
  const campos: SeisCExtraidas = { camara: "", ropa: "", contexto: "", luz: "" };
  for (const linea of texto.split("\n")) {
    const encontrado = /^\s*[-*•]?\s*([A-Za-z]+)\s*:\s*(.+)$/.exec(linea);
    const etiqueta = encontrado?.[1];
    const valor = encontrado?.[2];
    if (etiqueta === undefined || valor === undefined) continue;
    const campo = CAMPO_POR_ETIQUETA[etiqueta.toUpperCase()];
    if (!campo || campos[campo] !== "") continue;
    campos[campo] = valor.trim().slice(0, CAMPO_MAXIMO);
  }
  const sinLeer = (Object.keys(campos) as (keyof SeisCExtraidas)[]).filter((campo) => campos[campo] === "");
  return { campos, sinLeer };
}

export interface PeticionExtraccion {
  usuarioId: string;
  proyectoId?: string | null;
  /** Medio del que se extrae. Va en la clave de idempotencia: la misma foto no se percibe dos veces. */
  medioId: string;
  imagen: ImagenParaChat;
}

/**
 * Extrae las 6C de una foto de referencia. Lanza `ErrorPercepcion` con lo que falta cuando la instalación no
 * tiene con qué mirar: unos campos inventados serían peores que unos campos vacíos.
 */
export async function extraerSeisC(peticion: PeticionExtraccion): Promise<ExtraccionDeReferencia> {
  const percepcion = await percibir({
    usuarioId: peticion.usuarioId,
    proyectoId: peticion.proyectoId ?? null,
    clase: "referencia",
    claveIdempotencia: `direccion:referencia:${peticion.medioId}`,
    imagen: peticion.imagen,
  });
  const { campos, sinLeer } = camposDeLaRespuesta(percepcion.hechos);
  return {
    campos,
    hechos: percepcion.hechos,
    proveedor: percepcion.proveedor,
    modelo: percepcion.modelo,
    confirmada: false,
    sinLeer,
  };
}

/** Lo que se le dice al usuario cuando la extracción ha dejado campos en blanco. */
export const NOMBRE_CAMPO_EXTRAIDO: Record<keyof SeisCExtraidas, string> = {
  camara: "Cámara",
  ropa: "Ropa",
  contexto: "Sitio",
  luz: "Luz",
};

export const avisoDeCamposSinLeer = (sinLeer: readonly (keyof SeisCExtraidas)[]): string =>
  sinLeer.length === 0
    ? ""
    : `De esta foto no se ha podido leer ${sinLeer.map((c) => NOMBRE_CAMPO_EXTRAIDO[c].toLowerCase()).join(", ")}. Escríbelo tú antes de generar.`;

/**
 * **Puerta de privacidad de la extracción.** Leer los campos de una foto significa **subirla entera** a un
 * servicio de percepción externo. Que las instrucciones prohíban describir a la persona acota lo que vuelve,
 * no lo que sale: el dato personal que abandona la instalación es la foto.
 *
 * La 0.24.0 fijó el invariante —la cara de una persona real solo se percibe si su consentimiento lo dice— y
 * aquí se aplica igual, con la diferencia de que no hay proyecto ni personaje principal del que deducir de
 * quién es la cara. Así que hay dos casos:
 *
 * - **la foto es referencia de un personaje suyo**: manda el consentimiento de ese personaje. Si es real y no
 *   ha declarado la coherencia, no se envía y se dice cómo arreglarlo. Un personaje inventado no la necesita;
 * - **la foto es suelta**: nadie sabe quién sale en ella, así que decide el usuario **con la verdad delante**.
 *   Sin su confirmación explícita no se envía nada.
 *
 * Devuelve el motivo por el que no se puede leer, o cadena vacía si se puede.
 */
export async function motivoSinPermisoParaLeer(
  medioId: string,
  /** El usuario ha confirmado expresamente que se suba esa foto al servicio de percepción. */
  confirmado: boolean,
): Promise<string> {
  const personajes = await db()
    .select({ id: characters.id, nombre: characters.name, virtual: characters.virtual })
    .from(characterReferences)
    .innerJoin(characters, eq(characters.id, characterReferences.characterId))
    .where(eq(characterReferences.mediaId, medioId));

  if (personajes.length === 0) {
    return confirmado ? "" : AVISO_FOTO_SUELTA;
  }
  for (const personaje of personajes) {
    if (personaje.virtual) continue;
    if (await declaraCoherencia(personaje.id)) continue;
    return `Esta foto es una referencia de «${personaje.nombre}», y leer sus campos obliga a enviarla a un servicio de percepción que no es el que genera. Su consentimiento no lo cubre: marca «${ETIQUETA_AUTORIZO_PARECIDO}» en su consentimiento y vuelve a intentarlo.`;
  }
  return "";
}

/**
 * Lo que hay que decirle al usuario antes de leer una foto suelta. Se enseña **antes** de que pulse, y su
 * confirmación viaja con la petición: sin ella el servidor no envía la imagen a ningún sitio.
 */
export const AVISO_FOTO_SUELTA =
  "Para leer los campos de esta foto hay que subirla a un servicio de percepción externo. No se lee quién sale en ella, pero la imagen sí sale de aquí. Confirma que quieres enviarla.";
