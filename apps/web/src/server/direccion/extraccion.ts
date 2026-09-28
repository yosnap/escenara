import { percibir } from "../coherencia/percepcion";
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
