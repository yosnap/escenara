import { and, asc, eq, inArray } from "drizzle-orm";
import { ESTADOS_ACTIVOS, ETIQUETA_ESTADO } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { precioOmniEstimado, VOCES_OMNI } from "@/lib/omni";
import { resumenDeEscena } from "@/lib/proyectos";
import {
  avisosDeSubtitulos,
  creditosDeVoz,
  type DisponibilidadVoz,
  type EscenaVozVista,
  type EstadoOmniVista,
  type FirmaOmni,
  familiaDeModeloDeVoz,
  PARAMETROS_VOZ_POR_DEFECTO,
  VOCES_OFRECIDAS,
  VOCES_POR_FAMILIA,
  type VozProyectoVista,
} from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { escenasDe, proyectoPropio } from "../asistente/consulta";
import { hechosDeModelo, parametrosDeControles } from "../controles/hechos";
import { evaluarParaMostrar } from "../controles/puerta";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, type FilaProyecto, generationJobs, media } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { creditosDeEscenaHablada, registroParaProducir, segundosDeEscenaOmni } from "../omni/escena";
import { eleccionOmni } from "../omni/registro";
import { creditosDelEnvio } from "../prompts/traduccion";
import { ErrorCatalogo } from "../proveedores/contrato";
import { muestrasDe } from "./muestra";
import { musicaDe } from "./musica";
import { firmaOmniDelProyecto, vozOmniDelProyecto } from "./omni";
import { clipsConDialogoHablado, escenaInvalidada, vozDelProyecto } from "./proyecto";
import { transcriptorDisponible } from "./transcripcion";
import { eleccionDeVoz } from "./tts";

/**
 * Lectura del estado de voz y subtítulos de un proyecto (RF08, 0.21.0).
 *
 * **Es solo lectura**: no genera ninguna voz, no transcribe nada, no aparta presupuesto y no escribe en ninguna
 * escena. Lo único que hace es juntar, escena a escena, el clip con su pista de voz y sus subtítulos, y decir **qué
 * quedó invalidado y qué costaría regenerarlo**.
 *
 * Un proyecto que no es tuyo responde 404, también para quien administra: es el guion de alguien.
 */

/** Medios que la pantalla necesita reproducir, en una sola consulta y con su URL temporal de siempre. */
async function mediosDeLaVoz(actor: Actor, ids: readonly (string | null)[]): Promise<Map<string, Medio>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Map();
  const filas: FilaMedio[] = await db().select().from(media).where(inArray(media.id, unicos));
  return new Map(filas.map((fila) => [fila.id, aDto(fila, actor)]));
}

/** Lo que hay que saber de los trabajos de voz de una escena: si hay uno vivo y qué pasó con el último. */
interface TrabajosDeVoz {
  enMarcha: Map<string, string>;
  /**
   * Motivo del **último** trabajo de voz fallido de cada escena, cuando es lo último que le ha pasado a su voz.
   *
   * Sale del propio trabajo y no de `scenes.lastFailureReason` a propósito: esa columna es del clip y la lee la
   * rejilla de producción, así que un fallo de la voz ahí marcaría la escena entera como fallida.
   */
  fallos: Map<string, string>;
  /**
   * Avisos de un trabajo que **salió bien**: hoy solo el del cambio automático de proveedor. No es un error, pero
   * quien paga tiene derecho a saber en qué cuenta se gastó y por qué.
   */
  avisos: Map<string, string>;
}

async function trabajosDeVoz(escenaIds: readonly string[]): Promise<TrabajosDeVoz> {
  const vacio: TrabajosDeVoz = { enMarcha: new Map(), fallos: new Map(), avisos: new Map() };
  if (escenaIds.length === 0) return vacio;
  const filas = await db()
    .select({
      escena: generationJobs.sceneId,
      estado: generationJobs.state,
      mensaje: generationJobs.errorMessage,
    })
    .from(generationJobs)
    .where(and(inArray(generationJobs.sceneId, [...escenaIds]), eq(generationJobs.kind, "voz")))
    // De la más antigua a la más nueva: así lo último que se escribe de cada escena es lo último que le pasó.
    .orderBy(asc(generationJobs.createdAt));
  const salida: TrabajosDeVoz = { enMarcha: new Map(), fallos: new Map(), avisos: new Map() };
  for (const fila of filas) {
    if (!fila.escena) continue;
    if (ESTADOS_ACTIVOS.includes(fila.estado)) {
      salida.enMarcha.set(fila.escena, ETIQUETA_ESTADO[fila.estado]);
      continue;
    }
    // Un trabajo posterior que sale bien borra el fallo del anterior: lo que se muestra es lo último que pasó.
    const mensaje = fila.mensaje?.trim() ?? "";
    if (fila.estado === "fallido" && mensaje !== "") salida.fallos.set(fila.escena, mensaje);
    else salida.fallos.delete(fila.escena);
    if (fila.estado === "listo" && mensaje !== "") salida.avisos.set(fila.escena, mensaje);
    else if (fila.estado === "listo") salida.avisos.delete(fila.escena);
  }
  return salida;
}

/**
 * Qué puede hacer esta instalación con la voz, **con su motivo cuando no puede**. Nunca se oculta un botón sin
 * decir por qué: un panel que simplemente no ofrece generar voz es indistinguible de uno roto.
 *
 * El precio se lee del catálogo y **no se inventa**: si el modelo de voz no tiene precio registrado,
 * `creditosPorEscena` es `null` y la pantalla se niega a ofrecer el gasto, igual que hace el resto de la
 * aplicación desde la 0.11.0.
 */
export async function disponibilidadDeVoz(usuarioId: string): Promise<DisponibilidadVoz> {
  const { vozTtsActivo } = await leerAjustes();
  const [transcripcion, parametros] = await Promise.all([transcriptorDisponible(), parametrosDeControles()]);
  const base = {
    voces: VOCES_OFRECIDAS,
    transcripcionDisponible: transcripcion.disponible,
    motivoTranscripcion: transcripcion.motivo,
  };
  // Sin modelo utilizable no hay nada que evaluar del modelo, pero la evaluación sigue existiendo: es la forma que
  // espera la pantalla, y un objeto vacío la obligaría a distinguir dos casos que no se distinguen en nada.
  const sinModelo = {
    ...base,
    controles: evaluarParaMostrar({ tipo: "voz" as const, parametros }),
    proveedor: "",
    nombreProveedor: "",
    reserva: null,
    totalReservas: 0,
  };
  if (!vozTtsActivo) {
    return {
      ...sinModelo,
      ttsDisponible: false,
      motivoTts:
        "Esta instalación no ofrece la pista de voz aparte. Los proyectos usan la voz del propio clip; quien administra puede encenderla en Admin › Ajustes › Voz y subtítulos.",
      creditosPorEscena: null,
      sello: "",
      modelo: "",
    };
  }
  try {
    // Sin diálogo: es el precio de referencia del modelo. Lo que cuesta **cada escena** lo lleva la escena.
    const opciones = await eleccionDeVoz(usuarioId);
    const eleccion = opciones.elegida;
    const { modelo, precio } = eleccion;
    return {
      ...base,
      // Las voces que se ofrecen son **las de la familia del modelo elegido**: los identificadores de ElevenLabs
      // y los de kokoro no son los mismos, y enseñar una voz que ese modelo no tiene sería ofrecer un error.
      voces: VOCES_POR_FAMILIA[familiaDeModeloDeVoz(modelo.modelo)],
      proveedor: modelo.proveedor,
      nombreProveedor: modelo.nombreProveedor,
      // La primera reserva del mapa es la que se narra en la pantalla; `totalReservas` dice cuántas hay.
      reserva:
        opciones.reservas[0] === undefined
          ? null
          : {
              proveedor: opciones.reservas[0].eleccion.modelo.proveedor,
              nombre: opciones.reservas[0].eleccion.modelo.nombreProveedor,
              modelo: opciones.reservas[0].eleccion.modelo.modelo,
              creditos: opciones.reservas[0].eleccion.precio.creditos,
            },
      totalReservas: opciones.reservas.length,
      // Los mismos hechos del modelo que evalúa la puerta al encolar: si la pantalla los evaluara de otra forma,
      // diría «listo» donde el servidor va a pedir una confirmación.
      controles: evaluarParaMostrar({ tipo: "voz", parametros, modelo: hechosDeModelo("voz", eleccion) }),
      ttsDisponible: true,
      motivoTts: "",
      creditosPorEscena: opciones.creditos,
      sello: precio.sello,
      modelo: modelo.modelo,
    };
  } catch (error) {
    // Sin modelo utilizable o sin precio registrado: se dice exactamente eso y no se ofrece gastar.
    const motivo =
      error instanceof ErrorCatalogo
        ? error.message
        : "No se ha podido leer el modelo de voz del catálogo de esta instalación.";
    return { ...sinModelo, ttsDisponible: false, motivoTts: motivo, creditosPorEscena: null, sello: "", modelo: "" };
  }
}

/** Estado de una escena a partir de datos ya cargados. Función pura sobre lo leído. */
function vistaDeEscena(
  proyecto: FilaProyecto,
  escena: FilaEscena,
  medios: Map<string, Medio>,
  trabajos: TrabajosDeVoz,
  clipsHablados: ReadonlySet<string>,
  disponibilidad: DisponibilidadVoz,
  firmaOmni: FirmaOmni | null,
): EscenaVozVista {
  return {
    id: escena.id,
    orden: escena.sortOrder,
    resumen: resumenDeEscena({ accion: escena.action, texto: escena.scriptText, orden: escena.sortOrder }),
    segundos: escena.plannedSeconds,
    dialogo: escena.scriptText,
    clip: escena.clipMediaId === null ? null : (medios.get(escena.clipMediaId) ?? null),
    audio: escena.voiceMediaId === null ? null : (medios.get(escena.voiceMediaId) ?? null),
    invalidada: escenaInvalidada(proyecto, escena, firmaOmni),
    clipHablado: clipsHablados.has(escena.id),
    invalidacion: escena.voiceInvalidationReason,
    subtitulos: escena.subtitles,
    editados: escena.subtitlesEditedAt !== null,
    avisos: avisosDeSubtitulos(escena.subtitles),
    // Lo que costaría **esta** escena, con su diálogo: es la cifra que se confirma y la que se aparta.
    creditos:
      disponibilidad.creditosPorEscena === null
        ? null
        : creditosDeVoz(disponibilidad.modelo, disponibilidad.creditosPorEscena, escena.scriptText),
    creditosReserva:
      disponibilidad.reserva === null
        ? null
        : creditosDeVoz(disponibilidad.reserva.modelo, disponibilidad.reserva.creditos, escena.scriptText),
    trabajoEnMarcha: trabajos.enMarcha.get(escena.id) ?? null,
    fallo: trabajos.fallos.get(escena.id) ?? null,
    avisoProveedor: trabajos.avisos.get(escena.id) ?? null,
  };
}

export async function estadoDeVoz(actor: Actor, proyectoId: unknown): Promise<VozProyectoVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const escenas = await escenasDe(proyecto.id);
  const [medios, trabajos, disponibilidad, musica, hablados] = await Promise.all([
    mediosDeLaVoz(
      actor,
      escenas.flatMap((e) => [e.clipMediaId, e.voiceMediaId]),
    ),
    trabajosDeVoz(escenas.map((e) => e.id)),
    disponibilidadDeVoz(actor.id),
    musicaDe(actor, proyecto.id),
    // Solo tiene sentido en modo `pista`: en `clip` que el clip hable es justo lo que se quiere.
    proyecto.voiceMode === "pista" ? clipsConDialogoHablado(db(), proyecto.id) : Promise.resolve<string[]>([]),
  ]);
  const clipsHablados = new Set(hablados);
  /**
   * En modo `omni` lo que hace válida una escena es **qué identidad y qué voz están registradas ahora**: se lee
   * una vez para todo el proyecto y se le pasa a cada escena. Fuera de ese modo no hay nada que leer.
   */
  const firmaOmni = proyecto.voiceMode === "omni" ? await firmaOmniDelProyecto(proyecto) : null;
  const vistas = escenas.map((escena) =>
    vistaDeEscena(proyecto, escena, medios, trabajos, clipsHablados, disponibilidad, firmaOmni),
  );
  /**
   * Muestras ya pagadas de la voz que usaría este proyecto. Se leen con los parámetros **del proyecto**: la misma
   * voz con otra estabilidad suena distinto, así que una muestra con otros parámetros no responde a la pregunta.
   */
  const muestras =
    disponibilidad.modelo === ""
      ? {}
      : Object.fromEntries(
          await muestrasDe(
            actor,
            disponibilidad.modelo,
            vozDelProyecto(proyecto)?.parametros ?? PARAMETROS_VOZ_POR_DEFECTO,
          ),
        );
  const porRegenerar = vistas.filter((e) => e.invalidada).length;
  /**
   * Coste de regenerar lo invalidado. En modo `clip` no hay ninguno: los subtítulos salen de transcribir, y
   * transcribir es local y gratis. En modo `pista` son las llamadas de voz de las escenas invalidadas, y **solo si
   * hay precio registrado**: sin precio no se estima, se dice por qué, y no se ofrece regenerar.
   */
  const soloTranscripcion = proyecto.voiceMode === "clip";
  const creditos = disponibilidad.creditosPorEscena;
  // Suma de lo que costaría cada escena invalidada **con su propio diálogo**, no una tarifa por el número de ellas.
  const costeDeLoInvalidado = vistas.filter((e) => e.invalidada).reduce((total, e) => total + (e.creditos ?? 0), 0);
  return {
    proyectoId: proyecto.id,
    titulo: proyecto.title,
    modo: proyecto.voiceMode,
    voz: vozDelProyecto(proyecto),
    disponibilidad,
    escenas: vistas,
    musica,
    muestras,
    porRegenerar,
    costeRegenerar: soloTranscripcion ? 0 : creditos === null ? null : costeDeLoInvalidado,
    motivoSinCoste: soloTranscripcion || creditos !== null ? "" : disponibilidad.motivoTts,
    omni: proyecto.voiceMode === "omni" ? await estadoOmni(actor, proyecto) : null,
  };
}

/**
 * Estado del modo Omni: la voz registrada, qué falta para producir y lo que cuesta una escena. Todo sale de los
 * mismos sitios que usa la puerta al producir, así que la pantalla no puede prometer algo que el servidor
 * rechace.
 */
async function estadoOmni(actor: Actor, proyecto: FilaProyecto): Promise<EstadoOmniVista> {
  const { falta, personaje } = await registroParaProducir(actor, proyecto);
  let creditosPorEscena: number | null = null;
  let precioEstimado = false;
  try {
    const { creditos } = await creditosDeEscenaHablada(proyecto);
    const { modelo } = await eleccionOmni();
    creditosPorEscena = await creditosDelEnvio(creditos);
    precioEstimado = precioOmniEstimado(segundosDeEscenaOmni(modelo.parametros.duraciones, proyecto));
  } catch {
    // Sin modelo Omni con precio registrado no se inventa ninguna cifra: la pantalla dirá que no se puede.
    creditosPorEscena = null;
  }
  return {
    voz: vozOmniDelProyecto(proyecto),
    voces: VOCES_OMNI,
    listo: falta === "",
    falta,
    creditosPorEscena,
    precioEstimado,
    personaje: personaje?.name ?? "",
  };
}
