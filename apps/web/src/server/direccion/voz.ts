import {
  ACENTO_POR_DEFECTO,
  type Acento,
  EJES_VOZ,
  type EjesVoz,
  NOMBRE_ACENTO,
  NOMBRE_VALOR_EJE_VOZ,
} from "@/lib/direccion";
import { DESCRIPCION_VOZ_OMNI_MAXIMA, DESCRIPCION_VOZ_OMNI_POR_DEFECTO } from "@/lib/omni";
import { ACENTO_INGLES, ejesVozEnIngles } from "./ingles";

/**
 * **Compositor de voz**: los cinco ejes del personaje más el acento del proyecto, convertidos en la descripción
 * que se le envía al proveedor al registrar la voz.
 *
 * Hasta la 0.24.0 esa descripción era una **constante en español de España**
 * (`lib/omni.ts › DESCRIPCION_VOZ_OMNI_POR_DEFECTO`). Aquí no se sustituye: se **compone con ella**. La
 * constante decía lo único que importaba —que el acento es peninsular y el tono conversacional— y ese sigue
 * siendo el punto de partida cuando el personaje no tiene ejes elegidos.
 *
 * Dos cosas que este fichero decide y conviene no perder de vista:
 *
 * - la descripción va **en inglés**, como el resto de lo que se le pide a un modelo, salvo la parte que nombra
 *   la variedad de español, que tiene que nombrarla para que se oiga;
 * - la **frase de ejemplo** que acompaña al registro sigue en español y no se traduce: es una muestra de la voz,
 *   no una instrucción.
 */

/** Lo que define una voz: los cinco ejes del personaje y el acento de su proyecto. */
export interface VozDirigida {
  ejes: EjesVoz;
  acento: Acento;
  /** Voz predefinida del proveedor sobre la que se matiza. Vacía = la instalación elige. */
  vozPresetId: string;
  /** Matiz corto escrito por quien creó el personaje, ya traducido al inglés. Vacío si no hay ninguno. */
  matiz: string;
}

/**
 * Descripción de voz para el registro del proveedor. Nunca sale vacía: sin descripción, el proveedor pone el
 * acento que quiera y la voz suena distinta cada vez que se registra.
 */
export function describirVoz(voz: VozDirigida): string {
  const rasgos = ejesVozEnIngles(voz.ejes).filter((rasgo) => rasgo !== "");
  const partes = [
    rasgos.length > 0 ? `A natural ${rasgos.join(", ")}` : "A natural conversational voice",
    ACENTO_INGLES[voz.acento] ?? ACENTO_INGLES[ACENTO_POR_DEFECTO],
    voz.matiz.trim(),
    "Not an advertising voice-over: no announcer delivery, no studio polish.",
  ];
  const descripcion = partes
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "")
    .map((parte) => (/[.!?]$/.test(parte) ? parte : `${parte}.`))
    .join(" ");
  const texto = descripcion.trim() === "" ? DESCRIPCION_VOZ_OMNI_POR_DEFECTO : descripcion;
  // El proveedor corta por su cuenta lo que pase de su límite; cortarlo aquí deja claro qué se envió.
  return texto.slice(0, DESCRIPCION_VOZ_OMNI_MAXIMA);
}

/**
 * Lo mismo, pero **en castellano y para el usuario**: lo que ha elegido, escrito de corrido. Es lo que se
 * enseña en la ficha del personaje, porque la descripción en inglés no sale de aquí (ADR-0022).
 */
export function resumirVoz(voz: VozDirigida): string {
  const rasgos = EJES_VOZ.map((eje) => NOMBRE_VALOR_EJE_VOZ[voz.ejes[eje]] ?? voz.ejes[eje]);
  return `Voz ${rasgos.join(", ").toLowerCase()}, con acento de ${NOMBRE_ACENTO[voz.acento]}.`;
}
