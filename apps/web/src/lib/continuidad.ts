import { limpiarTextoDePrompt } from "./ficha-personaje";
import type { Medio } from "./media/tipos";

/**
 * **Continuidad entre los clips de un vídeo completo**: la biblia que se guarda con el proyecto (vestuario fijo de
 * cada personaje y el lugar) y los **planos base**, un fotograma por plano situado en el lugar con el personaje y su
 * ropa, del que arrancan todos los clips de ese plano.
 *
 * Todo lo de aquí es puro: lo usan el servidor para decidir y componer, y los tests sin base de datos.
 *
 * Reglas que manda este fichero:
 *
 * - el vestuario y el lugar de la biblia se escriben **en inglés**: son instrucciones visuales para el proveedor y
 *   nunca se enseñan al usuario normal;
 * - **un plano por personaje que sale solo** en alguna escena con lugar. Las escenas con dos personas en plano no
 *   tienen plano base: el fotograma de una escena se genera con un solo personaje, y un plano con una sola persona
 *   sería el primer fotograma de un clip en el que tienen que salir las dos;
 * - **sin lugar no hay plano base**: la identidad registrada y el lugar descrito en la biblia mantienen la
 *   continuidad, como hasta ahora;
 * - no se encadena el último fotograma de un clip con el siguiente: obligaría a producir en serie y arrastraría
 *   los errores, y además es excluyente con la identidad registrada.
 */

/** Largo máximo de cada texto de la biblia. Sobra para una frase de vestuario o de lugar. */
export const TEXTO_BIBLIA_MAXIMO = 300;

/** Un plano base del proyecto: quién sale, el fotograma que se encargó y el que se dio por bueno. */
export interface PlanoBaseGuardado {
  /** Personaje que sale solo en el plano: es la clave del plano. */
  personajeId: string;
  /** Trabajo de fotograma que se encargó para este plano; `null` si todavía no se ha pedido. */
  trabajoId: string | null;
  /** Fotograma que una persona aprobó y que comparten todas las escenas del plano; `null` mientras no lo haya. */
  medioId: string | null;
}

/** La biblia de continuidad de un proyecto. Vacía en todos los proyectos que no son un vídeo completo. */
export interface BibliaContinuidad {
  /** El sitio y la luz donde pasa todo, en inglés. Vacío si el modelo no lo dijo. */
  lugar: string;
  /** Vestuario fijo de cada personaje para todo el vídeo, en inglés, por identificador de personaje. */
  vestuario: Record<string, string>;
  planos: PlanoBaseGuardado[];
}

export const BIBLIA_VACIA: BibliaContinuidad = { lugar: "", vestuario: {}, planos: [] };

const texto = (valor: unknown): string => limpiarTextoDePrompt(valor, TEXTO_BIBLIA_MAXIMO).trim();
const idONulo = (valor: unknown): string | null => (typeof valor === "string" && valor !== "" ? valor : null);

/**
 * Lee la biblia tal como está guardada. La columna es JSON y una fila antigua o tocada a mano no puede tirar la
 * producción: lo que no tenga la forma esperada se descarta, campo a campo.
 */
export function leerBibliaContinuidad(valor: unknown): BibliaContinuidad {
  if (valor === null || typeof valor !== "object") return BIBLIA_VACIA;
  const crudo = valor as Record<string, unknown>;
  const vestuario: Record<string, string> = {};
  if (crudo.vestuario && typeof crudo.vestuario === "object") {
    for (const [id, ropa] of Object.entries(crudo.vestuario as Record<string, unknown>)) {
      const limpio = texto(ropa);
      if (id !== "" && limpio !== "") vestuario[id] = limpio;
    }
  }
  const planos = (Array.isArray(crudo.planos) ? crudo.planos : []).flatMap((p) => {
    const plano = (p ?? {}) as Record<string, unknown>;
    const personajeId = idONulo(plano.personajeId);
    return personajeId ? [{ personajeId, trabajoId: idONulo(plano.trabajoId), medioId: idONulo(plano.medioId) }] : [];
  });
  return { lugar: texto(crudo.lugar), vestuario, planos };
}

/** `true` si el proyecto tiene biblia: lo escribió entero el asistente como vídeo completo. */
export const tieneBiblia = (biblia: BibliaContinuidad): boolean =>
  biblia.lugar !== "" || Object.keys(biblia.vestuario).length > 0;

/** `true` si ese medio es el plano base aprobado de algún plano del proyecto. */
export const esPlanoBase = (biblia: BibliaContinuidad, medioId: string | null): boolean =>
  medioId !== null && biblia.planos.some((p) => p.medioId === medioId);

// ── Qué planos hacen falta ────────────────────────────────────────────────────────────────────────────────

/** Lo que hace falta saber de una escena para decidir su plano. */
export interface EscenaParaPlano {
  id: string;
  /** Quién sale en ella, en orden: uno en una persona y en cada plano de un podcast, dos en una entrevista. */
  personajes: readonly string[];
  /** `true` si la escena tiene lugar (el suyo o el del proyecto). */
  conLugar: boolean;
}

/** Un plano que hace falta: quién sale y qué escenas arrancan de su fotograma, en orden. */
export interface PlanoNecesario {
  personajeId: string;
  escenas: string[];
}

export type MotivoSinPlano = "sin_lugar" | "dos_personas" | "sin_personaje";

export const TEXTO_SIN_PLANO: Record<MotivoSinPlano, string> = {
  sin_lugar:
    "No tiene lugar, así que no hace falta plano base: la identidad registrada y el lugar descrito mantienen la continuidad.",
  dos_personas:
    "Salen las dos personas en el mismo plano. El fotograma base se genera con una sola, así que esta escena sigue con la identidad registrada y el lugar descrito.",
  sin_personaje: "No tiene a nadie en el reparto, así que no hay plano que preparar.",
};

/**
 * **Planos base que necesita un proyecto**: uno por personaje que sale solo en alguna escena con lugar, en el orden
 * en que aparecen. Las escenas que no tienen plano salen en `sinPlano` con su motivo.
 *
 * En un vídeo de 20 s: 1 plano en una persona, 2 en un podcast (el de cada uno) y ninguno en una entrevista, donde
 * los dos comparten plano en todos los clips.
 */
export function planosNecesarios(escenas: readonly EscenaParaPlano[]): {
  planos: PlanoNecesario[];
  sinPlano: { escenaId: string; motivo: MotivoSinPlano }[];
} {
  const porPersonaje = new Map<string, PlanoNecesario>();
  const sinPlano: { escenaId: string; motivo: MotivoSinPlano }[] = [];
  for (const escena of escenas) {
    const [unico, ...resto] = escena.personajes;
    if (!unico) {
      sinPlano.push({ escenaId: escena.id, motivo: "sin_personaje" });
      continue;
    }
    if (resto.length > 0) {
      sinPlano.push({ escenaId: escena.id, motivo: "dos_personas" });
      continue;
    }
    if (!escena.conLugar) {
      sinPlano.push({ escenaId: escena.id, motivo: "sin_lugar" });
      continue;
    }
    const plano = porPersonaje.get(unico) ?? { personajeId: unico, escenas: [] };
    plano.escenas.push(escena.id);
    porPersonaje.set(unico, plano);
  }
  return { planos: [...porPersonaje.values()], sinPlano };
}

// ── Lo que viaja en el prompt ─────────────────────────────────────────────────────────────────────────────

/**
 * Bloque de continuidad del prompt, en inglés: el vestuario fijo de cada personaje que sale y, si la escena no
 * tiene lugar propio, el sitio de la biblia. Se repite **literal** en cada clip y en cada plano base, que es lo que
 * refuerza que la ropa y el sitio no cambien de un corte a otro. Vacío si no hay nada que fijar.
 *
 * Con lugar elegido, el sitio lo describe el lugar (y su fotograma base): repetir el de la biblia podría
 * contradecirlo.
 */
export function bloqueDeContinuidad(
  biblia: BibliaContinuidad,
  personajes: readonly { id: string; nombre: string }[],
  conLugar: boolean,
): string {
  const lineas: string[] = [];
  for (const p of personajes) {
    const ropa = biblia.vestuario[p.id];
    if (ropa) lineas.push(`${limpiarTextoDePrompt(p.nombre, 80)} wears exactly: ${ropa}.`);
  }
  if (!conLugar && biblia.lugar !== "") lineas.push(`Setting and light: ${biblia.lugar}.`);
  if (lineas.length === 0) return "";
  return `Continuity, identical in every clip of this video (same outfit, same place, same light): ${lineas.join(" ")}`;
}

/** Une el bloque de continuidad a un texto del prompt, sin dejar líneas vacías. */
export const conContinuidad = (escena: string, bloque: string): string =>
  bloque === "" ? escena : `${escena}\n${bloque}`;

// ── Lugar combinado con la identidad registrada ────────────────────────────────────────────────────────────

/**
 * `true` si el fotograma de la escena viaja junto a la identidad registrada.
 *
 * - con el ajuste experimental general encendido, como hasta ahora, para cualquier fotograma aprobado;
 * - con el ajuste de los vídeos completos encendido, **solo** si el fotograma aprobado es un plano base del proyecto.
 *   Se enciende cuando el propietario haya escuchado la voz con imagen combinada y la dé por buena.
 */
export function combinaLugarConIdentidad(datos: {
  ajusteGeneral: boolean;
  ajusteVideoCompleto: boolean;
  esPlanoBase: boolean;
}): boolean {
  return datos.ajusteGeneral || (datos.ajusteVideoCompleto && datos.esPlanoBase);
}

// ── Lo que ve la pantalla de los planos base ──────────────────────────────────────────────────────────────

/** En qué punto está un plano base. */
export type EstadoPlanoBase = "sin_pedir" | "en_marcha" | "listo" | "aprobado" | "fallido";

export interface PlanoBaseVista {
  personajeId: string;
  nombre: string;
  /** Orden de las escenas que arrancan de este plano. */
  escenas: number[];
  estado: EstadoPlanoBase;
  /** El fotograma generado (listo o aprobado); `null` mientras no lo haya. */
  medio: Medio | null;
  /** Por qué falló, ya escrito para el usuario; vacío si no ha fallado. */
  motivo: string;
}

export interface PlanosBaseVista {
  /** `true` si el proyecto es un vídeo completo escrito por el asistente: solo entonces hay planos base. */
  videoCompleto: boolean;
  /** Por qué este proyecto no prepara planos base ahora; `null` si puede. */
  motivo: string | null;
  planos: PlanoBaseVista[];
  /** Escenas sin plano base, con su orden y el motivo en llano. */
  sinPlano: { orden: number; motivo: string }[];
  /** Lo que cuestan los planos que faltan por pedir. `null` si no hay precio de imagen utilizable. */
  coste: { creditosPorPlano: number; porPedir: number; total: number; sello: string; comprobado: string } | null;
  /** `true` si los clips arrancarán de su plano base: el ajuste de los vídeos completos está encendido. */
  combinado: boolean;
}
