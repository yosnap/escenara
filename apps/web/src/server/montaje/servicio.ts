import { and, eq } from "drizzle-orm";
import { type EncuadresDelMontaje, encuadreAutomatico, encuadreValido, mismoEncuadre } from "@/lib/formatos";
import {
  erroresDeMontaje,
  esFormatoMontaje,
  esPosicionEtiqueta,
  esVolumen,
  FORMATO_MONTAJE_POR_DEFECTO,
  type Fragmento,
  MOTIVO_ETIQUETA_OBLIGATORIA,
  montajeInicial,
  type PosicionEtiqueta,
  volumenNormalizado,
} from "@/lib/montaje";
import { esFormatoSubtitulos, type FormatoSubtitulos } from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaMontaje, type FilaProyecto, montages } from "../db/esquema";
import { limitesDeProyecto } from "../limites-proyecto";
import type { Actor } from "../media/servicio";
import { ErrorMontaje } from "./errores";
import { escenasParaValidar, type MaterialDelProyecto, materialDelProyecto, montajeDeProyecto } from "./material";

/**
 * Montaje de un proyecto (RF08, 0.32.0): crearlo, leerlo y guardarlo.
 *
 * Tres reglas gobiernan este fichero:
 *
 * 1. **el montaje es del proyecto de quien lo pide**. Un proyecto ajeno responde 404 (`proyectoPropio`), y quien
 *    administra no es excepción: un montaje es el trabajo de alguien, igual que su guion;
 * 2. **nada se guarda a medias ni se corrige en silencio**. Un fragmento de otra escena, un recorte más largo que
 *    el clip o una escena sin clip **no se guardan**: se rechazan diciendo cuál falla. Los volúmenes sí se
 *    recortan a la horquilla, porque son un mando y no un dato;
 * 3. **la etiqueta de contenido sintético no se puede quitar** en ningún montaje. Lo impide el servidor, no la
 *    interfaz; los personajes completamente animados también la llevan.
 *
 * Nada de lo que hay aquí cuesta créditos: guardar una línea de tiempo es escribir una fila.
 */

/** Guardar un montaje: lo que llega de la pantalla, ya con los tipos resueltos por `entrada.ts`. */
export interface CambiosDeMontaje {
  fragmentos: Fragmento[];
  volumenVoz: number;
  volumenMusica: number;
  subtitulosQuemados: boolean;
  formatoSubtitulos: FormatoSubtitulos;
  etiquetaVisible: boolean;
  etiquetaPosicion: PosicionEtiqueta;
  /**
   * Encuadres por formato y escena (0.41.0). `undefined` deja los guardados como están: quien guardaba sin ellos
   * antes de esta versión no los borra por no mandarlos.
   */
  encuadres?: EncuadresDelMontaje;
  /**
   * Versión que el navegador creía vigente. Si no coincide con la guardada, se rechaza con 409: otra pestaña (o
   * la misma persona en otro ordenador) ha reordenado la línea de tiempo y pisarla sin avisar sería perder su
   * trabajo sin decírselo.
   */
  version: number;
}

/** El montaje está apagado en esta instalación: se dice qué pasa y quién lo enciende. */
export async function exigirMontajeActivo(): Promise<void> {
  const { montajeActivo } = await leerAjustes();
  if (!montajeActivo) {
    throw new ErrorMontaje(
      503,
      "El montaje está desactivado en esta instalación. Pídele a quien la administra que lo active en Admin › Ajustes.",
    );
  }
}

/**
 * Montaje del proyecto, creándolo con la línea de tiempo propuesta si todavía no existe: **todas** las escenas
 * con clip, en su orden y sin recortar.
 *
 * Crearlo es una lectura desde el punto de vista del usuario (abrir la pantalla), así que no exige que el
 * montaje esté activo ni que haya material: un proyecto sin clips abre su montaje vacío y la pantalla dice qué
 * falta. Lo que exige material es exportar.
 */
export async function montajeDelProyecto(
  actor: Actor,
  proyectoId: unknown,
): Promise<{ montaje: FilaMontaje; material: MaterialDelProyecto }> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const material = await materialDelProyecto(proyecto);
  const existente = await montajeDeProyecto(proyecto.id);
  if (existente) return { montaje: await conEtiquetaCoherente(existente), material };
  return { montaje: await crearMontaje(proyecto, material), material };
}

/**
 * Crea el montaje del proyecto. Si dos peticiones llegan a la vez, la restricción única por proyecto decide y la
 * segunda lee el que acaba de crear la primera: nunca hay dos montajes del mismo proyecto.
 */
async function crearMontaje(proyecto: FilaProyecto, material: MaterialDelProyecto): Promise<FilaMontaje> {
  const [creado] = await db()
    .insert(montages)
    .values({
      projectId: proyecto.id,
      fragments: montajeInicial(escenasParaValidar(material)),
      format: FORMATO_MONTAJE_POR_DEFECTO,
      labelVisible: true,
    })
    .onConflictDoNothing({ target: montages.projectId })
    .returning();
  if (creado) return creado;
  const existente = await montajeDeProyecto(proyecto.id);
  if (!existente) throw new ErrorMontaje(500, "No se ha podido crear el montaje de este proyecto.");
  return existente;
}

/**
 * Actualiza montajes anteriores guardados sin etiqueta. Encenderla cambia los píxeles del MP4, por lo que sube
 * la versión y no reutiliza una exportación anterior bajo la misma clave de idempotencia.
 */
async function conEtiquetaCoherente(montaje: FilaMontaje): Promise<FilaMontaje> {
  if (montaje.labelVisible) return montaje;
  const [actualizado] = await db()
    .update(montages)
    // Encender la etiqueta cambia los píxeles del MP4: debe crear otra versión para no reutilizar una
    // exportación anterior sin rótulo por la clave de idempotencia (montaje, versión).
    .set({ labelVisible: true, version: montaje.version + 1, updatedAt: new Date() })
    .where(and(eq(montages.id, montaje.id), eq(montages.version, montaje.version), eq(montages.labelVisible, false)))
    .returning();
  if (actualizado) return actualizado;
  const vigente = await montajeDeProyecto(montaje.projectId);
  if (!vigente) throw new ErrorMontaje(404, "El montaje de este proyecto ya no existe.");
  return vigente;
}

/**
 * Guarda la línea de tiempo. Devuelve el montaje resultante con su versión **ya subida**, que es la que hay que
 * usar para exportar.
 */
export async function guardarMontaje(
  actor: Actor,
  proyectoId: unknown,
  cambios: CambiosDeMontaje,
): Promise<{ montaje: FilaMontaje; material: MaterialDelProyecto }> {
  await exigirMontajeActivo();
  const proyecto = await proyectoPropio(actor, proyectoId);
  const material = await materialDelProyecto(proyecto);
  const actual = (await montajeDeProyecto(proyecto.id)) ?? (await crearMontaje(proyecto, material));

  const { segundosMaximos } = await limitesDeProyecto();
  const errores = erroresDeMontaje(cambios.fragmentos, escenasParaValidar(material), segundosMaximos);
  if (errores.length > 0) throw new ErrorMontaje(400, errores.join(" "));
  const encuadres =
    cambios.encuadres === undefined ? actual.framings : encuadresDelProyecto(cambios.encuadres, material);

  // La etiqueta obligatoria se impone **aquí**, no en la pantalla: una petición que pida quitarla se rechaza en
  // lugar de guardarse a medias, para que el usuario sepa que no se ha hecho lo que pedía y por qué.
  if (!cambios.etiquetaVisible) {
    throw new ErrorMontaje(409, MOTIVO_ETIQUETA_OBLIGATORIA);
  }

  const [guardado] = await db()
    .update(montages)
    .set({
      fragments: cambios.fragmentos,
      voiceVolume: volumenNormalizado(cambios.volumenVoz),
      musicVolume: volumenNormalizado(cambios.volumenMusica),
      burnSubtitles: cambios.subtitulosQuemados,
      subtitleFormat: cambios.formatoSubtitulos,
      labelVisible: true,
      labelPosition: cambios.etiquetaPosicion,
      framings: encuadres,
      version: actual.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(montages.id, actual.id), eq(montages.version, cambios.version)))
    .returning();
  if (!guardado) {
    throw new ErrorMontaje(
      409,
      "Este montaje ha cambiado desde que abriste la pantalla, así que no se ha guardado nada para no perder lo que hay. Vuelve a cargarla y repite el cambio.",
    );
  }
  return { montaje: guardado, material };
}

/**
 * Encuadres que se guardan: solo de escenas del proyecto, y sin los que coinciden con el automático (así «volver
 * a automático» no deja una marca que diga lo mismo con otras palabras). Una escena ajena se rechaza diciendo cuál.
 */
function encuadresDelProyecto(encuadres: EncuadresDelMontaje, material: MaterialDelProyecto): EncuadresDelMontaje {
  const propias = new Set(material.escenas.map((e) => e.escena.id));
  const limpios: EncuadresDelMontaje = {};
  for (const [formato, porEscena] of Object.entries(encuadres)) {
    if (!esFormatoMontaje(formato)) continue;
    const suyos: Record<string, NonNullable<EncuadresDelMontaje[typeof formato]>[string]> = {};
    for (const [escenaId, encuadre] of Object.entries(porEscena ?? {})) {
      if (!propias.has(escenaId)) {
        throw new ErrorMontaje(
          400,
          "Hay un encuadre de una escena que no es de este proyecto. Vuelve a cargar el montaje.",
        );
      }
      if (!mismoEncuadre(encuadre, encuadreAutomatico(formato))) suyos[escenaId] = encuadre;
    }
    if (Object.keys(suyos).length > 0) limpios[formato] = suyos;
  }
  return limpios;
}

// ── Lectura de la petición ──────────────────────────────────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Convierte el cuerpo de la petición en cambios con tipos de verdad. Es el **borde del sistema**: aquí no se
 * supone nada de lo que llega, y cada campo que no encaja se rechaza diciendo cuál es.
 *
 * Los identificadores de escena no se validan contra la base de datos aquí: eso lo hace `erroresDeMontaje` con
 * las escenas reales del proyecto, que es quien puede decir «esa escena no es de este proyecto».
 */
export function leerCambiosDeMontaje(cuerpo: Record<string, unknown>): CambiosDeMontaje {
  const crudos = cuerpo.fragmentos;
  if (!Array.isArray(crudos)) throw new ErrorMontaje(400, "Envía la línea de tiempo en «fragmentos».");
  const fragmentos: Fragmento[] = crudos.map((crudo, indice) => {
    if (!esObjeto(crudo)) throw new ErrorMontaje(400, `El fragmento ${indice + 1} no es válido.`);
    const { escenaId, entrada, salida } = crudo;
    if (typeof escenaId !== "string" || escenaId === "") {
      throw new ErrorMontaje(400, `El fragmento ${indice + 1} no dice de qué escena es.`);
    }
    if (typeof entrada !== "number" || typeof salida !== "number") {
      throw new ErrorMontaje(400, `El recorte del fragmento ${indice + 1} tiene que ir en segundos.`);
    }
    return { escenaId, entrada: Math.round(entrada * 100) / 100, salida: Math.round(salida * 100) / 100 };
  });

  if (!esVolumen(cuerpo.volumenVoz) || !esVolumen(cuerpo.volumenMusica)) {
    throw new ErrorMontaje(400, "Los volúmenes van de 0 a 2 (0 % a 200 %).");
  }
  if (typeof cuerpo.subtitulosQuemados !== "boolean" || typeof cuerpo.etiquetaVisible !== "boolean") {
    throw new ErrorMontaje(400, "Las opciones de subtítulos y de etiqueta son sí o no.");
  }
  if (!esFormatoSubtitulos(cuerpo.formatoSubtitulos)) {
    throw new ErrorMontaje(400, "Los subtítulos se adjuntan en «srt» o en «vtt».");
  }
  if (!esPosicionEtiqueta(cuerpo.etiquetaPosicion)) {
    throw new ErrorMontaje(400, "La etiqueta va «arriba» o «abajo».");
  }
  if (cuerpo.formato !== undefined && !esFormatoMontaje(cuerpo.formato)) {
    throw new ErrorMontaje(
      400,
      "Los formatos son «vertical_9_16», «vertical_4_5», «cuadrado_1_1» y «horizontal_16_9».",
    );
  }
  const encuadres = cuerpo.encuadres === undefined ? undefined : leerEncuadres(cuerpo.encuadres);
  if (typeof cuerpo.version !== "number" || !Number.isInteger(cuerpo.version) || cuerpo.version < 1) {
    throw new ErrorMontaje(400, "Falta la versión del montaje que estabas editando. Vuelve a cargar la pantalla.");
  }
  return {
    fragmentos,
    volumenVoz: cuerpo.volumenVoz,
    volumenMusica: cuerpo.volumenMusica,
    subtitulosQuemados: cuerpo.subtitulosQuemados,
    formatoSubtitulos: cuerpo.formatoSubtitulos,
    etiquetaVisible: cuerpo.etiquetaVisible,
    etiquetaPosicion: cuerpo.etiquetaPosicion,
    ...(encuadres === undefined ? {} : { encuadres }),
    version: cuerpo.version,
  };
}

/** Tope de encuadres por petición: cuatro formatos por el techo de escenas de un proyecto, con holgura. */
const ENCUADRES_MAXIMOS = 200;

/** Lee los encuadres de la petición. Cada uno que no encaja se rechaza diciendo de qué formato es. */
function leerEncuadres(crudo: unknown): EncuadresDelMontaje {
  if (!esObjeto(crudo)) throw new ErrorMontaje(400, "Los encuadres van por formato y, dentro, por escena.");
  const leidos: EncuadresDelMontaje = {};
  let cuantos = 0;
  for (const [formato, porEscena] of Object.entries(crudo)) {
    if (!esFormatoMontaje(formato)) throw new ErrorMontaje(400, `«${formato.slice(0, 40)}» no es un formato.`);
    if (!esObjeto(porEscena)) throw new ErrorMontaje(400, `Los encuadres de ${formato} van por escena.`);
    const suyos: Record<string, NonNullable<ReturnType<typeof encuadreValido>>> = {};
    for (const [escenaId, valor] of Object.entries(porEscena)) {
      const encuadre = encuadreValido(valor);
      if (!encuadre) {
        throw new ErrorMontaje(
          400,
          `Un encuadre de ${formato} no es válido: «recorte» con x e y enteros de 0 a 100, o «bandas».`,
        );
      }
      if (++cuantos > ENCUADRES_MAXIMOS) throw new ErrorMontaje(400, "Demasiados encuadres en una sola petición.");
      suyos[escenaId] = encuadre;
    }
    leidos[formato] = suyos;
  }
  return leidos;
}
