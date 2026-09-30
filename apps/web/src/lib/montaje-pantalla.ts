import type { EncuadresDelMontaje } from "./formatos";
import { moverEnLista } from "./lista-ordenable";
import {
  duracionTotalDeFragmentos,
  type EstadoExportacion,
  ETAPAS_EXPORTACION,
  ETIQUETA_ETAPA_EXPORTACION,
  type EtapaExportacion,
  type Fragmento,
  type PosicionEtiqueta,
  RECORTE_MINIMO_SEGUNDOS,
  SEGUNDOS_MAXIMOS_MONTAJE,
} from "./montaje";
import type { FormatoSubtitulos } from "./voz";

/**
 * Lo que la **pantalla** de montaje necesita calcular mientras se edita (RF08, 0.32.0): reordenar, recortar con
 * sus límites, sumar la duración y saber si queda algo sin guardar.
 *
 * Todo es **puro y sin React**: entra una lista y sale otra. Así el orden que mueve el ratón y el que mueve el
 * teclado pasan por la misma función, y las reglas del recorte se prueban sin montar ni un componente.
 *
 * Esto **no valida** el montaje: eso lo hace `lib/montaje.ts › erroresDeMontaje` con las escenas reales, y lo
 * decide el servidor al guardar. Aquí solo se evita que un mando deje la línea de tiempo en un estado imposible.
 */

/** Un fragmento mientras se edita, con una clave estable: es lo que se arrastra y lo que identifica su tarjeta. */
export interface FragmentoEditable extends Fragmento {
  /** Estable mientras la tarjeta vive. No viaja al servidor: la línea de tiempo es una lista ordenada. */
  clave: string;
}

/**
 * Duración por encima de la cual se avisa. No es un límite (el límite es `SEGUNDOS_MAXIMOS_MONTAJE`): es lo que
 * dura un reel que la gente termina de ver en TikTok, Reels y Shorts.
 */
export const SEGUNDOS_RAZONABLES_MONTAJE = 60;

const dosDecimales = (v: number) => Math.round(v * 100) / 100;

/** Claves nuevas dentro de una lista: `f1`, `f2`… sin repetir ninguna de las que ya están. */
function claveLibre(usadas: ReadonlySet<string>): string {
  let numero = usadas.size + 1;
  while (usadas.has(`f${numero}`)) numero += 1;
  return `f${numero}`;
}

/** Los fragmentos guardados, listos para editarse. El orden se conserva: es el del montaje. */
export function aEditables(fragmentos: readonly Fragmento[]): FragmentoEditable[] {
  return fragmentos.map((f, indice) => ({ ...f, clave: `f${indice + 1}` }));
}

/** Lo que viaja al servidor: la lista en su orden, sin las claves de la pantalla. */
export function sinClaves(editables: readonly FragmentoEditable[]): Fragmento[] {
  return editables.map(({ escenaId, entrada, salida }) => ({ escenaId, entrada, salida }));
}

/** Reordena por la lista de claves que devuelve el arrastre. Una clave desconocida se ignora. */
export function reordenarPorClaves(
  editables: readonly FragmentoEditable[],
  claves: readonly string[],
): FragmentoEditable[] {
  const porClave = new Map(editables.map((f) => [f.clave, f]));
  const ordenados = claves.flatMap((clave) => porClave.get(clave) ?? []);
  // Lo que el arrastre no menciona se queda al final en su orden: nunca se pierde un fragmento por reordenar.
  const mencionadas = new Set(ordenados.map((f) => f.clave));
  return [...ordenados, ...editables.filter((f) => !mencionadas.has(f.clave))];
}

/**
 * Mueve un fragmento una posición arriba (`-1`) o abajo (`+1`): es lo que hacen los botones y las flechas del
 * teclado. Fuera de la lista no mueve nada, así que el botón del extremo no hace nada raro.
 */
export function moverFragmento(
  editables: readonly FragmentoEditable[],
  indice: number,
  desplazamiento: -1 | 1,
): FragmentoEditable[] {
  const destino = indice + desplazamiento;
  if (indice < 0 || indice >= editables.length || destino < 0 || destino >= editables.length) return [...editables];
  return moverEnLista(editables, indice, destino);
}

export function quitarFragmento(editables: readonly FragmentoEditable[], clave: string): FragmentoEditable[] {
  return editables.filter((f) => f.clave !== clave);
}

/** Añade la escena entera al final de la línea de tiempo. Sin clip no se añade: no habría nada que montar. */
export function anadirEscena(
  editables: readonly FragmentoEditable[],
  escena: { escenaId: string; duracionClip: number | null },
): FragmentoEditable[] {
  if (escena.duracionClip === null || escena.duracionClip <= 0) return [...editables];
  const clave = claveLibre(new Set(editables.map((f) => f.clave)));
  return [...editables, { clave, escenaId: escena.escenaId, entrada: 0, salida: dosDecimales(escena.duracionClip) }];
}

/**
 * Mueve una manecilla del recorte dejando el fragmento **siempre utilizable**: la entrada no pasa de la salida
 * menos el trozo mínimo, y la salida no pasa del final del clip.
 *
 * Se recorta en silencio a propósito, porque es un mando: arrastrar la manecilla más allá del final del clip
 * quiere decir «hasta el final», no «error». Lo que sí se rechaza con su motivo es guardar un recorte imposible,
 * y eso lo hace el servidor.
 */
export function recortar(
  fragmento: FragmentoEditable,
  borde: "entrada" | "salida",
  segundos: number,
  duracionClip: number | null,
): FragmentoEditable {
  if (!Number.isFinite(segundos)) return fragmento;
  // Sin clip medido no hay techo conocido: se respeta el que ya tenía el fragmento en lugar de inventarse uno.
  const techo = duracionClip !== null && duracionClip > 0 ? dosDecimales(duracionClip) : fragmento.salida;
  if (borde === "entrada") {
    const maximo = dosDecimales(fragmento.salida - RECORTE_MINIMO_SEGUNDOS);
    return { ...fragmento, entrada: dosDecimales(Math.min(Math.max(0, segundos), Math.max(0, maximo))) };
  }
  const minimo = dosDecimales(fragmento.entrada + RECORTE_MINIMO_SEGUNDOS);
  return { ...fragmento, salida: dosDecimales(Math.max(minimo, Math.min(segundos, Math.max(minimo, techo)))) };
}

/** Duración de la línea de tiempo que se está editando. */
export const duracionDelBorrador = (editables: readonly FragmentoEditable[]): number =>
  duracionTotalDeFragmentos(sinClaves(editables));

/** Aviso sobre la duración, con el tono con el que se pinta. `null` cuando no hay nada que decir. */
export interface AvisoDuracion {
  tono: "error" | "info";
  texto: string;
}

/**
 * Qué decir de la duración total. Dos cosas distintas, y por eso dos tonos: pasarse del máximo **impide**
 * exportar (el servidor lo rechaza), y pasar del minuto solo es un consejo sobre el formato.
 */
export function avisoDeDuracion(
  segundos: number,
  /** Máximo de esta instalación (Admin › Ajustes); el techo si no se indica. */
  segundosMaximos: number = SEGUNDOS_MAXIMOS_MONTAJE,
): AvisoDuracion | null {
  const maximo = Math.min(segundosMaximos, SEGUNDOS_MAXIMOS_MONTAJE);
  if (segundos > maximo) {
    return {
      tono: "error",
      texto: `El montaje dura ${Math.round(segundos)} s y el máximo de esta instalación son ${maximo} s. Recorta algún fragmento o quita escenas: así como está no se puede exportar.`,
    };
  }
  if (segundos > SEGUNDOS_RAZONABLES_MONTAJE) {
    return {
      tono: "info",
      texto: `El montaje dura ${Math.round(segundos)} s. Se puede exportar, pero en TikTok, Reels y Shorts los vídeos de menos de ${SEGUNDOS_RAZONABLES_MONTAJE} s se ven hasta el final mucho más a menudo.`,
    };
  }
  return null;
}

// ── Etapas de una exportación ───────────────────────────────────────────────────────────────────────────────

/** Una etapa del render tal como se pinta: su nombre en llano y en qué punto está. */
export interface EtapaEnPantalla {
  nombre: string;
  estado: "hecha" | "en-curso" | "pendiente" | "error";
}

/**
 * Las etapas del render con su punto actual. La etapa la manda el servidor (sale del `-progress` de FFmpeg), así
 * que esto solo decide qué va **antes** y qué va **después** de ella: nada se calcula por tiempo.
 *
 * Una exportación fallida marca con error la etapa en la que se quedó y deja pendientes las siguientes: así se ve
 * dónde se rompió, y no un «ha fallado» sin sitio.
 */
export function etapasEnPantalla(
  etapa: EtapaExportacion,
  estado: EstadoExportacion,
  etiquetas: Record<EtapaExportacion, string> = ETIQUETA_ETAPA_EXPORTACION,
): EtapaEnPantalla[] {
  const actual = ETAPAS_EXPORTACION.indexOf(etapa);
  return ETAPAS_EXPORTACION.map((clave, indice) => ({
    nombre: etiquetas[clave],
    estado:
      estado === "listo"
        ? "hecha"
        : indice < actual
          ? "hecha"
          : indice > actual
            ? "pendiente"
            : estado === "fallido"
              ? "error"
              : "en-curso",
  }));
}

// ── Borrador de la pantalla ─────────────────────────────────────────────────────────────────────────────────

/** Todo lo editable del montaje mientras se toca, antes de guardarlo. */
export interface BorradorMontaje {
  fragmentos: FragmentoEditable[];
  volumenVoz: number;
  volumenMusica: number;
  subtitulosQuemados: boolean;
  formatoSubtitulos: FormatoSubtitulos;
  etiquetaVisible: boolean;
  etiquetaPosicion: PosicionEtiqueta;
  /** Encuadres ajustados por formato y escena. Cambian los píxeles del MP4, así que se guardan con el montaje. */
  encuadres: EncuadresDelMontaje;
}

/** Encuadres en un orden estable, para que dos objetos iguales den la misma firma. */
const firmaDeEncuadres = (encuadres: EncuadresDelMontaje): string =>
  Object.entries(encuadres)
    .flatMap(([formato, porEscena]) =>
      Object.entries(porEscena ?? {}).map(
        ([escena, e]) => `${formato}/${escena}=${e.modo === "bandas" ? "bandas" : `${e.x},${e.y}`}`,
      ),
    )
    .sort()
    .join(";");

/**
 * Firma de lo que se guardaría. Sirve para una sola cosa: saber si **hay algo sin guardar**, comparándola con la
 * del montaje que devolvió el servidor.
 *
 * Es el orden y los valores, nunca las claves de la pantalla: reordenar y volver a dejarlo como estaba no cuenta
 * como cambio, y por eso no aparece un «sin guardar» que no corresponde a nada.
 */
export function firmaDeGuardado(borrador: BorradorMontaje): string {
  const fragmentos = borrador.fragmentos.map(
    (f) => `${f.escenaId}:${dosDecimales(f.entrada)}-${dosDecimales(f.salida)}`,
  );
  return [
    fragmentos.join("|"),
    dosDecimales(borrador.volumenVoz),
    dosDecimales(borrador.volumenMusica),
    borrador.subtitulosQuemados ? "quemados" : "adjuntos",
    borrador.formatoSubtitulos,
    borrador.etiquetaVisible ? "etiqueta" : "sin-etiqueta",
    borrador.etiquetaPosicion,
    firmaDeEncuadres(borrador.encuadres),
  ].join("·");
}

/** Cuánto mueve el encuadre cada pulsación de una flecha, en puntos del porcentaje. */
export const PASO_ENCUADRE_TECLADO = 5;

/** Posición del encuadre (0–100 en cada eje), redondeada y dentro de los bordes. */
export const acotarEncuadre = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

/**
 * El encuadre por teclado, la alternativa al arrastre: cada flecha lo mueve un paso en su eje, sin salirse de los
 * bordes. Devuelve `null` con cualquier otra tecla, para que siga haciendo lo suyo (Tab, Intro…).
 */
export function moverEncuadreConTecla(
  posicion: { x: number; y: number },
  tecla: string,
): { x: number; y: number } | null {
  const cambios: Record<string, [number, number]> = {
    ArrowLeft: [-PASO_ENCUADRE_TECLADO, 0],
    ArrowRight: [PASO_ENCUADRE_TECLADO, 0],
    ArrowUp: [0, -PASO_ENCUADRE_TECLADO],
    ArrowDown: [0, PASO_ENCUADRE_TECLADO],
  };
  const cambio = cambios[tecla];
  if (!cambio) return null;
  return { x: acotarEncuadre(posicion.x + cambio[0]), y: acotarEncuadre(posicion.y + cambio[1]) };
}
