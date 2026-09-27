import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { EvaluacionVista } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import {
  type EscenaProduccionVista,
  esDuracionDisponible,
  etapaDeTrabajo,
  type ProduccionVista,
  type TrabajoDeEscena,
  trabajoEnMarcha,
  type VersionDeEscena,
} from "@/lib/produccion";
import { resumenDeEscena } from "@/lib/proyectos";
import { leerAjustes } from "../ajustes";
import { afirmacionesDe, escenasDe, proyectoPropio } from "../asistente/consulta";
import { comprometidoDelProyecto, type EleccionesDelPlan, eleccionesDelPlan } from "../asistente/plan";
import { posicionesEnCola } from "../cola/toma";
import type { HechosEscena, ParametrosControles } from "../controles/contrato";
import { hechosDeModelo, parametrosDeControles } from "../controles/hechos";
import { evaluarParaMostrar } from "../controles/puerta";
import { db } from "../db/cliente";
import {
  type FilaAfirmacion,
  type FilaEscena,
  type FilaMedio,
  type FilaProyecto,
  type FilaTrabajo,
  generationJobs,
  media,
} from "../db/esquema";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { condicionEnCurso } from "../generacion/trabajos";
import { type Actor, aDto } from "../media/servicio";
import { ultimaVersion } from "../personajes/ficha";
import { plantillaVigenteDe } from "../prompts/consulta";
import { creditosDelEnvio } from "../prompts/traduccion";

/**
 * Lectura del estado de producción de un proyecto (RF06, 0.19.0).
 *
 * **Es solo lectura**: ninguna función de este fichero encola nada, aparta presupuesto ni llama a un endpoint de
 * pago del proveedor. Y **nada de lo que devuelve es inventado**: cada escena lleva su estado real, la etapa por
 * la que va su trabajo, el coste que congeló el plan y el coste que el proveedor ha informado. No hay ningún
 * porcentaje ni ninguna previsión de tiempo restante (`lib/produccion.ts`).
 *
 * El prompt no sale de aquí (ADR-0022): lo que viaja son estados, etapas, importes y medios.
 */

/**
 * Escenas del usuario con algún trabajo en marcha, **en todos sus proyectos**. Es el recuento con el que se compara
 * el tope de escenas en vuelo, así que tiene que ser el mismo que aplica la transacción del encolado
 * (`cola/encolar.ts › escenasEnVueloDe`): contar solo las de este proyecto haría que la pantalla prometiera hueco
 * que no hay.
 */
async function escenasEnVueloDelUsuario(usuarioId: string): Promise<number> {
  const [fila] = await db()
    .select({ total: sql<number>`count(distinct ${generationJobs.sceneId})::int` })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), isNotNull(generationJobs.sceneId), condicionEnCurso()));
  return fila?.total ?? 0;
}

/** Trabajos de esas escenas, de lo más reciente a lo más antiguo. Una consulta para todas, no una por escena. */
async function trabajosDeEscenas(escenaIds: readonly string[]): Promise<Map<string, FilaTrabajo[]>> {
  const porEscena = new Map<string, FilaTrabajo[]>(escenaIds.map((id) => [id, []]));
  if (escenaIds.length === 0) return porEscena;
  const filas = await db()
    .select()
    .from(generationJobs)
    .where(inArray(generationJobs.sceneId, [...escenaIds]))
    .orderBy(desc(generationJobs.createdAt));
  for (const fila of filas) if (fila.sceneId) porEscena.get(fila.sceneId)?.push(fila);
  return porEscena;
}

/**
 * Medios que la rejilla tiene que poder mostrar: los resultados de los trabajos, el fotograma aprobado y el clip
 * de cada escena. Una consulta para todos, y su DTO lleva la URL temporal de siempre (caduca en una hora).
 */
async function mediosDeLaRejilla(actor: Actor, ids: readonly (string | null)[]): Promise<Map<string, Medio>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Map();
  const filas: FilaMedio[] = await db().select().from(media).where(inArray(media.id, unicos));
  return new Map(filas.map((fila) => [fila.id, aDto(fila, actor)]));
}

const vistaDeTrabajo = (fila: FilaTrabajo, posicion: number | null, medios: Map<string, Medio>): TrabajoDeEscena => ({
  id: fila.id,
  tipo: fila.kind,
  estado: fila.state,
  estadoProveedor: fila.providerState,
  etapa: etapaDeTrabajo(fila.state, fila.stage),
  creditosEstimados: fila.estimatedCredits,
  creditosConsumidos: fila.consumedCredits,
  error: fila.errorMessage,
  motivoFallo: fila.failureReason,
  posicionEnCola: posicion,
  medio: fila.resultMediaId === null ? null : (medios.get(fila.resultMediaId) ?? null),
  modelo: fila.model,
  creadoEn: fila.createdAt.toISOString(),
  enviadoEn: fila.sentAt?.toISOString() ?? null,
  terminadoEn: fila.finishedAt?.toISOString() ?? null,
});

/**
 * Qué cambió antes de esta generación (PRD §6). Solo se afirma lo que está guardado: con qué modelo salió cada
 * versión. Nada más, porque nada más se puede demostrar.
 */
function cambioDeVersion(fila: FilaTrabajo, anterior: FilaTrabajo | undefined): string {
  if (!anterior) return "";
  if (anterior.model !== fila.model) return `La anterior se generó con ${anterior.model} y esta con ${fila.model}.`;
  return "Se regeneró con el mismo modelo.";
}

/**
 * Versiones anteriores de la escena: todos sus trabajos menos los dos vigentes. No se borran nunca: cada una se
 * pagó y su resultado sigue en la biblioteca.
 */
function versionesDe(
  filas: readonly FilaTrabajo[],
  vigentes: readonly string[],
  medios: Map<string, Medio>,
): VersionDeEscena[] {
  // La lista llega de lo más reciente a lo más antiguo, así que «la anterior» es la siguiente del array.
  return filas
    .filter((f) => !vigentes.includes(f.id))
    .map((fila, indice, lista) => ({
      trabajoId: fila.id,
      tipo: fila.kind,
      modelo: fila.model,
      estado: fila.state,
      creditosEstimados: fila.estimatedCredits,
      creditosConsumidos: fila.consumedCredits,
      medio: fila.resultMediaId === null ? null : (medios.get(fila.resultMediaId) ?? null),
      creadoEn: fila.createdAt.toISOString(),
      cambio: cambioDeVersion(fila, lista[indice + 1]),
    }));
}

/**
 * Créditos que hay que confirmar por un trabajo de ese tipo: el modelo **más su traducción**, si esta instalación
 * traduce. Es la misma cifra que compara el servidor al confirmar (`generacion/servicio.ts`), así que el botón no
 * puede decir una y el servidor esperar otra. `0` cuando no hay modelo con precio.
 */
async function creditosDeTrabajo(eleccion: EleccionDeTrabajo | null): Promise<number> {
  if (!eleccion) return 0;
  return creditosDelEnvio(Math.ceil(eleccion.precio.creditos));
}

/** Créditos que el proveedor ha informado en esta escena. Nunca una estimación disfrazada de gasto. */
const consumidoDe = (filas: readonly FilaTrabajo[]): number =>
  filas.reduce((suma, f) => suma + (f.consumedCredits ?? 0), 0);

/**
 * Lo que hace falta para evaluar los controles de todas las escenas **sin una consulta por escena**: el sello del
 * precio vigente y las versiones vigentes de ficha y plantilla. Todo eso es del proyecto, no de la escena.
 */
interface ContextoDeControles {
  parametros: ParametrosControles;
  selloVigente: string;
  versionPersonaje: string | null;
  versionPlantilla: string | null;
}

async function contextoDeControles(
  actor: Actor,
  proyecto: FilaProyecto,
  elecciones: EleccionesDelPlan,
): Promise<ContextoDeControles> {
  const [parametros, version, plantilla] = await Promise.all([
    parametrosDeControles(),
    proyecto.mainCharacterId ? ultimaVersion(proyecto.mainCharacterId) : null,
    plantillaVigenteDe(actor.id, "image_edit"),
  ]);
  return {
    parametros,
    selloVigente: elecciones.fotograma?.precio.sello ?? "",
    versionPersonaje: version?.id ?? null,
    versionPlantilla: plantilla?.versionId ?? null,
  };
}

/**
 * Hechos de control de una escena a partir de datos ya cargados. Es la **misma forma** que evalúa la puerta al
 * producirla (`asistente/plan.ts › hechosDeEscena`), así que la rejilla no puede decir «listo» mirando otra cosa.
 */
function hechosDeFila(
  fila: FilaEscena,
  proyecto: FilaProyecto,
  afirmaciones: readonly FilaAfirmacion[],
  contexto: ContextoDeControles,
): HechosEscena {
  return {
    planAprobado: proyecto.planApprovedAt !== null,
    aprobada: fila.state !== "borrador",
    motivoInvalidacion: fila.invalidationReason,
    precioCambiado: fila.approvedFrameStamp !== "" && fila.approvedFrameStamp !== contexto.selloVigente,
    fichaCambiada:
      fila.approvedCharacterVersionId !== null && fila.approvedCharacterVersionId !== contexto.versionPersonaje,
    plantillaCambiada:
      fila.approvedTemplateVersionId !== null && fila.approvedTemplateVersionId !== contexto.versionPlantilla,
    afirmacionesPorVerificar: afirmaciones.filter((a) => a.sceneId === fila.id && a.state === "por_verificar").length,
  };
}

/** Una escena en la rejilla: su estado, sus dos trabajos, sus medios, su coste y su historial. */
function vistaDeEscena(
  fila: FilaEscena,
  trabajos: readonly FilaTrabajo[],
  controles: EvaluacionVista,
  puestos: Map<string, number>,
  medios: Map<string, Medio>,
): EscenaProduccionVista {
  // El trabajo vigente de cada tipo es el más reciente: la lista viene ordenada por fecha descendente.
  const fotograma = trabajos.find((t) => t.kind === "fotograma") ?? null;
  const animacion = trabajos.find((t) => t.kind === "animacion") ?? null;
  const vigentes = [fotograma?.id, animacion?.id].filter((id): id is string => id !== undefined);
  return {
    id: fila.id,
    orden: fila.sortOrder,
    resumen: resumenDeEscena({ accion: fila.action, texto: fila.scriptText, orden: fila.sortOrder }),
    estado: fila.state,
    segundos: fila.plannedSeconds,
    controles,
    fotograma: fotograma ? vistaDeTrabajo(fotograma, puestos.get(fotograma.id) ?? null, medios) : null,
    animacion: animacion ? vistaDeTrabajo(animacion, puestos.get(animacion.id) ?? null, medios) : null,
    fotogramaAprobado: fila.approvedFrameMediaId === null ? null : (medios.get(fila.approvedFrameMediaId) ?? null),
    clip: fila.clipMediaId === null ? null : (medios.get(fila.clipMediaId) ?? null),
    creditosEstimados: fila.estimatedCredits,
    creditosConsumidos: consumidoDe(trabajos),
    reintentosUsados: fila.retriesUsed,
    presupuestoReintentos: fila.retryBudget,
    motivoUltimoFallo: fila.lastFailureReason,
    cambiadaDesdeLaGeneracion: fila.changedSinceGeneration,
    versiones: versionesDe(trabajos, vigentes, medios),
  };
}

/**
 * Escenas cuyo fotograma se puede encolar ahora: aprobadas, sin fotograma en marcha y sin fotograma ya guardado.
 * Es la misma lista que recorre la producción del proyecto, así que lo que se muestra es lo que se va a encolar.
 */
export const escenasPorProducir = (escenas: readonly EscenaProduccionVista[]): EscenaProduccionVista[] =>
  escenas.filter(
    (e) =>
      e.estado !== "borrador" &&
      !trabajoEnMarcha(e.fotograma) &&
      !(e.fotograma?.estado === "listo" && e.fotograma.medio !== null),
  );

/** Estado completo de la producción de un proyecto. Un proyecto ajeno responde 404, igual que en 0.17.0. */
export async function estadoDeProduccion(actor: Actor, proyectoId: unknown): Promise<ProduccionVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const [filasEscena, elecciones, ajustes, comprometido] = await Promise.all([
    escenasDe(proyecto.id),
    eleccionesDelPlan(),
    leerAjustes(),
    comprometidoDelProyecto(proyecto.id),
  ]);
  const ids = filasEscena.map((e) => e.id);
  const [porEscena, afirmaciones, puestos, contexto, enVuelo] = await Promise.all([
    trabajosDeEscenas(ids),
    afirmacionesDe(ids),
    posicionesEnCola(),
    contextoDeControles(actor, proyecto, elecciones),
    escenasEnVueloDelUsuario(actor.id),
  ]);
  const medios = await mediosDeLaRejilla(actor, [
    ...[...porEscena.values()].flat().map((t) => t.resultMediaId),
    ...filasEscena.flatMap((e) => [e.approvedFrameMediaId, e.clipMediaId]),
  ]);
  const escenas = filasEscena.map((fila) =>
    vistaDeEscena(
      fila,
      porEscena.get(fila.id) ?? [],
      // El mismo motor que cierra la puerta al producirla, con datos ya cargados: ni una consulta más por escena.
      evaluarParaMostrar({
        tipo: "fotograma",
        parametros: contexto.parametros,
        escena: hechosDeFila(fila, proyecto, afirmaciones, contexto),
      }),
      puestos,
      medios,
    ),
  );

  // Lo que el usuario confirma por trabajo es **todo** lo que va a pagar: la generación y su traducción.
  const porFotograma = await creditosDeTrabajo(elecciones.fotograma);
  const porClip = await creditosDeTrabajo(elecciones.animacion);
  const porProducir = escenasPorProducir(escenas);
  return {
    proyectoId: proyecto.id,
    titulo: proyecto.title,
    presupuestoCreditos: proyecto.authorizedCredits,
    comprometidoCreditos: Math.round(comprometido),
    planAprobado: proyecto.planApprovedAt !== null,
    escenas,
    porProducir: porProducir.length,
    creditosPorFotograma: porFotograma,
    creditosPorClip: porClip,
    selloClip: elecciones.animacion?.precio.sello ?? "",
    selloFotograma: elecciones.fotograma?.precio.sello ?? "",
    controlesDelModelo: evaluarParaMostrar({
      tipo: "fotograma",
      parametros: contexto.parametros,
      ...(elecciones.fotograma ? { modelo: hechosDeModelo("fotograma", elecciones.fotograma) } : {}),
    }),
    // El recuento es del usuario, no del proyecto: es el mismo que cierra la puerta al encolar.
    enVuelo,
    maximoEnVuelo: ajustes.escenasEnVuelo,
    impedimentos: impedimentosDeProduccion({
      planAprobado: proyecto.planApprovedAt !== null,
      protagonista: proyecto.mainCharacterId,
      sinPrecio: !elecciones.fotograma || !elecciones.animacion,
      segundosDelClip: elecciones.animacion?.modelo.parametros.duraciones[0] ?? null,
      presupuesto: proyecto.authorizedCredits,
      comprometido,
      creditosFotograma: porFotograma,
      porProducir: porProducir.length,
    }),
  };
}

/**
 * Lo que impide producir ahora mismo, en lenguaje llano. Lo de cada escena lo dice su propia evaluación de
 * controles; esto es lo que afecta al proyecto entero.
 *
 * Función pura sobre datos ya leídos, así que se prueba sin base de datos.
 */
export function impedimentosDeProduccion(datos: {
  planAprobado: boolean;
  protagonista: string | null;
  sinPrecio: boolean;
  /** Duración del clip que declara el modelo de animación vigente; `null` si no hay modelo. */
  segundosDelClip: number | null;
  presupuesto: number;
  comprometido: number;
  creditosFotograma: number;
  porProducir: number;
}): string[] {
  const impedimentos: string[] = [];
  if (!datos.planAprobado) impedimentos.push("El plan de este proyecto no está aprobado: apruébalo antes de producir.");
  if (datos.protagonista === null) {
    impedimentos.push(
      "Este proyecto no tiene protagonista asignado. Elige un personaje con consentimiento vigente: sus fotos son lo que da identidad a cada fotograma.",
    );
  }
  if (datos.sinPrecio) {
    impedimentos.push(
      "Falta algún modelo con precio registrado, así que no se puede estimar ni producir. Pídeselo a quien administra.",
    );
  }
  // Decisión provisional del propietario (2026-09-27): solo se ofrece la duración con coste medido.
  if (datos.segundosDelClip !== null && !esDuracionDisponible(datos.segundosDelClip)) {
    impedimentos.push(
      `El modelo de animación vigente genera clips de ${datos.segundosDelClip} s y esta versión solo ofrece los de 4 s, que son los que tienen coste medido. Elige otro modelo predeterminado en el catálogo.`,
    );
  }
  if (datos.presupuesto > 0 && datos.porProducir > 0) {
    const libre = datos.presupuesto - datos.comprometido;
    if (datos.creditosFotograma > libre) {
      impedimentos.push(
        `Al proyecto le quedan ${formatearCreditos(Math.max(0, Math.round(libre)))} de su presupuesto autorizado y el siguiente fotograma necesita ${formatearCreditos(datos.creditosFotograma)}. Sube el presupuesto del proyecto o quita escenas.`,
      );
    }
  }
  return impedimentos;
}

/** Trabajos de una sola escena, de lo más reciente a lo más antiguo. */
export const trabajosDeEscena = (escenaId: string): Promise<FilaTrabajo[]> =>
  db()
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.sceneId, escenaId))
    .orderBy(desc(generationJobs.createdAt));

/** El trabajo más reciente de una escena para ese tipo, o `null` si nunca ha habido ninguno. */
export async function ultimoTrabajoDeEscena(
  escenaId: string,
  tipo: "fotograma" | "animacion",
): Promise<FilaTrabajo | null> {
  const [fila] = await db()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.sceneId, escenaId), eq(generationJobs.kind, tipo)))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);
  return fila ?? null;
}
