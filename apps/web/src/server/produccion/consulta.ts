import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { EvaluacionVista } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import {
  duracionesEnTexto,
  duracionParaModelo,
  type EscenaProduccionVista,
  esDuracionDisponible,
  esperaAutorizacionDeReintento,
  etapaDeTrabajo,
  type ProduccionVista,
  type TrabajoDeEscena,
  trabajoEnMarcha,
  type VersionDeEscena,
} from "@/lib/produccion";
import { resumenDeEscena } from "@/lib/proyectos";
import type { ModoVoz } from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { afirmacionesDe, escenasDe, proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { comprometidoDelProyecto, type EleccionesDelPlan, eleccionesDelPlan } from "../asistente/plan";
import { posicionesEnCola } from "../cola/toma";
import type { HechosEscena, ParametrosControles } from "../controles/contrato";
import { hechosDeModelo, hechosDePersonajeCitado, parametrosDeControles } from "../controles/hechos";
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
import {
  creditosDeEscenaHablada,
  duracionesDeOmni,
  precioDeDuracionEstimado,
  registroParaProducir,
  segundosDeEscenaOmni,
} from "../omni/escena";
import { eleccionOmni } from "../omni/registro";
import { ultimaVersion } from "../personajes/ficha";
import { plantillaVigenteDe } from "../prompts/consulta";
import { creditosDelEnvio } from "../prompts/traduccion";
import { ErrorCatalogo } from "../proveedores/contrato";
import { type RepartoDePantalla, repartoDePantallaDeEscena } from "../reparto/pantalla";
import { controlesProductoClip } from "./controles-producto-clip";

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
    guionEnClipMudo: fila.clipFormat === "voz_en_off" && fila.scriptText.trim() !== "",
  };
}

/** Una escena en la rejilla: su estado, sus dos trabajos, sus medios, su coste y su historial. */
function vistaDeEscena(
  fila: FilaEscena,
  trabajos: readonly FilaTrabajo[],
  controles: EvaluacionVista,
  controlesDelProductoClip: EvaluacionVista | null,
  puestos: Map<string, number>,
  medios: Map<string, Medio>,
  /** Reparto de dos personajes de esta escena (0.28.0); `null` en una escena de un personaje. */
  reparto: RepartoDePantalla | null,
): EscenaProduccionVista {
  // El trabajo vigente de cada tipo es el más reciente: la lista viene ordenada por fecha descendente.
  const fotograma = trabajos.find((t) => t.kind === "fotograma") ?? null;
  const animacion = trabajos.find((t) => t.kind === "animacion") ?? null;
  // Un podcast tiene dos trabajos vigentes: el más reciente de cada plano. Los anteriores quedan en el historial.
  const pedidosPodcast =
    fila.castFormat === "podcast" ? trabajos.filter((t) => t.kind === "animacion" && t.castClipOrder !== null) : [];
  // El último intento puede haber encolado solo el primer clip. En ese caso no se le atribuye el segundo de una
  // pareja anterior: el historial conserva aquella pareja, y aquí se ve únicamente lo pedido en este intento.
  const clipsPodcast = pedidosPodcast[0]?.castClipOrder === 2 ? pedidosPodcast.slice(0, 2) : pedidosPodcast.slice(0, 1);
  const vigentes = [fotograma?.id, animacion?.id, ...clipsPodcast.map((t) => t.id)].filter(
    (id): id is string => id !== undefined,
  );
  return {
    id: fila.id,
    formatoClip: fila.clipFormat,
    orden: fila.sortOrder,
    resumen: resumenDeEscena({ accion: fila.action, texto: fila.scriptText, orden: fila.sortOrder }),
    estado: fila.state,
    segundos: fila.plannedSeconds,
    controles,
    ...(controlesDelProductoClip ? { controlesDelProductoClip } : {}),
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
    conProducto: fila.productId !== null,
    // Lo mismo que decide el servidor al aprobar el fotograma: un paso, un cobro y un botón que lo dice.
    faltaInsertarCaptura: fila.productId !== null && (fotograma?.digitalStep ?? "") === "pantalla_negra",
    reparto,
    /**
     * Los clips de un podcast, **en el orden del intercambio**. Se reconocen por el turno que el encolado les
     * escribió (`castClipOrder`), que es lo único que distingue dos clips de la misma escena, y el nombre sale del
     * reparto vigente: si el reparto ha cambiado desde que se pidieron, se queda vacío en lugar de mentir.
     */
    clipsHablados: clipsPodcast
      .map((t) => ({
        orden: t.castClipOrder ?? 1,
        nombre: reparto?.reparto.miembros.find((miembro) => miembro.personajeId === t.characterId)?.nombre ?? "",
        trabajo: vistaDeTrabajo(t, puestos.get(t.id) ?? null, medios),
      }))
      .sort((a, b) => a.orden - b.orden),
    versiones: versionesDe(trabajos, vigentes, medios),
  };
}

/**
 * Escenas cuyo fotograma se puede encolar ahora: aprobadas, sin fotograma en marcha y sin fotograma ya guardado.
 * Es la misma lista que recorre la producción del proyecto, así que lo que se muestra es lo que se va a encolar.
 *
 * Queda fuera la escena cuyo último intento falló **con coste posible**: volver a enviarla puede costar otra vez, y
 * eso solo lo autoriza el usuario escena a escena con su presupuesto de reintentos (ADR-0024). Sin esta exclusión,
 * el botón de lote pagaría otra vez los fallos sin consumir ningún reintento ni pedir permiso.
 */
export const escenasPorProducir = (
  escenas: readonly EscenaProduccionVista[],
  modo: ModoVoz = "clip",
): EscenaProduccionVista[] => {
  /**
   * En modo `omni` (0.22.0) la escena **no tiene fotograma**: se produce entera de una vez, así que lo que dice si
   * queda algo por encolar es su clip. Mirar el fotograma aquí ofrecería producir escenas que ya están hechas.
   */
  const trabajo = (e: EscenaProduccionVista) => (modo === "omni" ? e.animacion : e.fotograma);
  return escenas.filter(
    (e) =>
      e.formatoClip !== "cantar" &&
      e.estado !== "borrador" &&
      !trabajoEnMarcha(trabajo(e)) &&
      !(trabajo(e)?.estado === "listo" && trabajo(e)?.medio !== null) &&
      !esperaAutorizacionDeReintento(e),
  );
};

/** Estado completo de la producción de un proyecto. Un proyecto ajeno responde 404, igual que en 0.17.0. */
export async function estadoDeProduccion(actor: Actor, proyectoId: unknown): Promise<ProduccionVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const [filasEscena, elecciones, ajustes, comprometido] = await Promise.all([
    escenasDe(proyecto.id),
    eleccionesDelPlan(actor.id),
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
  const escenas = await Promise.all(
    filasEscena.map(async (fila) => {
      const [controlesDelProductoClip, reparto] = await Promise.all([
        controlesProductoClip(actor.id, fila, elecciones.animacion, contexto.parametros),
        /** El reparto solo se consulta cuando hay dos personajes en la escena. */
        fila.castFormat === "solo" ? null : repartoDePantallaDeEscena(actor, fila, proyecto),
      ]);
      return vistaDeEscena(
        fila,
        porEscena.get(fila.id) ?? [],
        // El mismo motor que cierra la puerta al producir el fotograma, con los datos ya cargados.
        evaluarParaMostrar({
          tipo: "fotograma",
          parametros: contexto.parametros,
          escena: hechosDeFila(fila, proyecto, afirmaciones, contexto),
        }),
        controlesDelProductoClip,
        puestos,
        medios,
        reparto,
      );
    }),
  );

  // Lo que el usuario confirma por trabajo es **todo** lo que va a pagar: la generación y su traducción.
  const omni = proyecto.voiceMode === "omni";
  /**
   * En modo `omni` la escena es un solo trabajo, así que no hay coste de fotograma y el del clip es el de la
   * escena hablada con la duración del proyecto: 63 créditos por 4 s medidos el 2026-09-28, y proporcional (y
   * marcado como estimado) en las demás duraciones.
   */
  const habladas = omni ? await costeDeEscenaHablada(actor, proyecto) : null;
  const porFotograma = omni ? 0 : await creditosDeTrabajo(elecciones.fotograma);
  const porClip = habladas ? await creditosDelEnvio(habladas.creditos) : await creditosDeTrabajo(elecciones.animacion);
  const porProducir = escenasPorProducir(escenas, proyecto.voiceMode);
  return {
    proyectoId: proyecto.id,
    titulo: proyecto.title,
    presupuestoCreditos: proyecto.authorizedCredits,
    comprometidoCreditos: Math.round(comprometido),
    planAprobado: proyecto.planApprovedAt !== null,
    escenas,
    porProducir: porProducir.length,
    creditosPorFotograma: porFotograma,
    // El umbral del aviso de gasto alto es de la instalación: viaja para que la confirmación pida la casilla
    // exactamente cuando el servidor la va a exigir, ni antes ni nunca.
    umbralAvisoCreditos: ajustes.avisoCreditos,
    modoVoz: proyecto.voiceMode,
    precioClipEstimado: habladas?.estimado ?? false,
    creditosPorClip: porClip,
    selloClip: habladas ? habladas.sello : (elecciones.animacion?.precio.sello ?? ""),
    selloFotograma: elecciones.fotograma?.precio.sello ?? "",
    // Modelo **y protagonista**: la puerta del encolado evalúa también al personaje (consentimiento, fotos
    // señaladas, cobertura de vistas), así que sus avisos confirmables tienen que salir aquí con su casilla. Sin
    // él, la pantalla decía «Listo» y el servidor rechazaba pidiendo una confirmación que no había dónde dar.
    controlesDelModelo: evaluarParaMostrar({
      tipo: "fotograma",
      parametros: contexto.parametros,
      ...(elecciones.fotograma ? { modelo: hechosDeModelo("fotograma", elecciones.fotograma) } : {}),
      ...(proyecto.mainCharacterId ? { personaje: await hechosDePersonajeCitado(proyecto.mainCharacterId) } : {}),
    }),
    // El recuento es del usuario, no del proyecto: es el mismo que cierra la puerta al encolar.
    enVuelo,
    maximoEnVuelo: ajustes.escenasEnVuelo,
    impedimentos: [
      ...(omni ? await impedimentosDeOmni(actor, proyecto) : []),
      ...impedimentosDeProduccion({
        planAprobado: proyecto.planApprovedAt !== null,
        protagonista: proyecto.mainCharacterId,
        /**
         * En modo `omni` **no hay fotograma**, así que el modelo de imagen no tiene por qué tener precio: lo que
         * hace falta es el de escenas habladas, y de eso responde `impedimentosDeOmni`. Y la duración se juzga
         * contra ese mismo modelo, no contra el de animación genérico.
         */
        sinPrecio: omni ? habladas === null : !elecciones.fotograma || !elecciones.animacion,
        segundosDelClip:
          omni || !elecciones.animacion
            ? null
            : duracionParaModelo(elecciones.animacion.modelo.parametros.duraciones, proyecto.clipSeconds),
        segundosDelProyecto: proyecto.clipSeconds,
        presupuesto: proyecto.authorizedCredits,
        comprometido,
        creditosFotograma: omni ? porClip : porFotograma,
        porProducir: porProducir.length,
        tieneEscenasNormales: escenas.some((escena) => escena.formatoClip !== "cantar"),
      }),
    ],
  };
}

/**
 * Coste de una escena hablada con la duración del proyecto, y si ese precio está medido o estimado. Sale del
 * mismo sitio que el que se confirma al producir (`omni/escena.ts`), así que la pantalla no puede decir una cifra
 * y el servidor esperar otra.
 */
async function costeDeEscenaHablada(
  actor: Actor,
  proyecto: FilaProyecto,
): Promise<{ creditos: number; sello: string; estimado: boolean } | null> {
  try {
    const { creditos, sello } = await creditosDeEscenaHablada(actor.id, proyecto);
    const { modelo } = await eleccionOmni(actor.id);
    return {
      creditos,
      sello,
      estimado: precioDeDuracionEstimado(modelo, segundosDeEscenaOmni(duracionesDeOmni(modelo), proyecto)),
    };
  } catch {
    // Sin modelo Omni utilizable no se inventa ningún precio: `impedimentosDeOmni` dice por qué y no se produce.
    return null;
  }
}

/**
 * Lo que impide producir **en modo Omni**, además de lo que impide producir en cualquier modo: sin voz
 * registrada y sin personaje registrado con ella, ninguna escena puede hablar. Los dos registros son gratuitos,
 * así que el mensaje dice dónde se arregla en lugar de limitarse a bloquear.
 */
async function impedimentosDeOmni(actor: Actor, proyecto: FilaProyecto): Promise<string[]> {
  const motivos: string[] = [];
  let modeloOmni: { nombre: string; modelo: string; duraciones: readonly number[] } | null = null;
  try {
    const { modelo } = await eleccionOmni(actor.id);
    modeloOmni = { nombre: modelo.nombre, modelo: modelo.modelo, duraciones: modelo.parametros.duraciones };
  } catch (error) {
    motivos.push(
      error instanceof ErrorCatalogo
        ? error.message
        : "Esta instalación no tiene ningún modelo de escenas habladas utilizable con precio registrado, así que no se puede producir en este modo.",
    );
  }
  /**
   * Qué falta lo decide **el mismo sitio que lo decide al producir** (`omni/escena.ts › registroParaProducir`),
   * que es quien sabe qué necesita cada motor: los de identidad registrada, la voz y el personaje registrados;
   * los de referencias, la voz del proyecto y su muestra ya pagada. Dos listas distintas acabarían diciendo
   * cosas distintas.
   */
  const { falta } = await registroParaProducir(actor, proyecto, modeloOmni?.modelo);
  if (falta !== "") motivos.push(`Este proyecto está en modo Omni y ${falta}`);
  if (modeloOmni) {
    const segundos = segundosDeEscenaOmni(modeloOmni.duraciones, proyecto);
    if (segundos !== proyecto.clipSeconds) {
      motivos.push(
        `Los clips de este proyecto son de ${proyecto.clipSeconds} s y ${modeloOmni.nombre} solo genera de ${segundos} s en esta instalación. Cambia la duración del proyecto a ${segundos} s antes de producir.`,
      );
    }
  }
  return motivos;
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
  /** Duración que se le pediría de verdad al modelo de animación vigente; `null` si no hay modelo. */
  segundosDelClip: number | null;
  /** Duración de clip elegida en el proyecto, en segundos. */
  segundosDelProyecto: number;
  presupuesto: number;
  comprometido: number;
  creditosFotograma: number;
  porProducir: number;
  tieneEscenasNormales: boolean;
}): string[] {
  const impedimentos: string[] = [];
  if (!datos.planAprobado) impedimentos.push("El plan de este proyecto no está aprobado: apruébalo antes de producir.");
  if (datos.protagonista === null) {
    impedimentos.push(
      "Este proyecto no tiene protagonista asignado. Elige un personaje con consentimiento vigente: sus fotos son lo que da identidad a cada fotograma.",
    );
  }
  if (datos.tieneEscenasNormales && datos.sinPrecio) {
    impedimentos.push(
      "Falta algún modelo con precio registrado, así que no se puede estimar ni producir. Pídeselo a quien administra.",
    );
  }
  // El canto tiene modelo, duración y precio propios. Un proyecto con escenas normales conserva este aviso incluso
  // después de generarlas: editar su duración obliga a revisar de nuevo el plan.
  const duracion = datos.tieneEscenasNormales
    ? impedimentoDeDuracion(datos.segundosDelClip, datos.segundosDelProyecto)
    : null;
  if (duracion) impedimentos.push(duracion);
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

/**
 * Solo se produce con duraciones que tengan coste medido, y solo la que ha elegido el proyecto: si el modelo
 * vigente no la admite, el clip duraría otra cosa de la que pone el plan. `null` si no hay nada que impedir.
 */
export function impedimentoDeDuracion(segundosDelClip: number | null, segundosDelProyecto: number): string | null {
  if (segundosDelClip === null) return null;
  if (!esDuracionDisponible(segundosDelClip)) {
    return `El modelo de animación vigente genera clips de ${segundosDelClip} s y esta versión solo ofrece los de ${duracionesEnTexto()}, que son los que tienen coste medido. Elige otro modelo predeterminado en el catálogo.`;
  }
  if (segundosDelClip !== segundosDelProyecto) {
    return `Los clips de este proyecto son de ${segundosDelProyecto} s y el modelo de animación vigente solo genera de ${segundosDelClip} s. Cambia la duración del proyecto o elige otro modelo predeterminado en el catálogo.`;
  }
  return null;
}

/**
 * Lo mismo, leyendo el modelo de animación vigente, para los caminos que encolan **una** escena sin pasar por
 * `producirProyecto`: producir, aprobar y regenerar tienen que negarse igual que el botón del proyecto.
 */
export async function exigirDuracionProducible(actor: Actor, proyecto: FilaProyecto): Promise<void> {
  const { animacion } = await eleccionesDelPlan(actor.id);
  if (!animacion) return; // Sin modelo con precio, el propio envío ya se rechaza por no poder estimarse.
  const motivo = impedimentoDeDuracion(
    duracionParaModelo(animacion.modelo.parametros.duraciones, proyecto.clipSeconds),
    proyecto.clipSeconds,
  );
  if (motivo) throw new ErrorProyecto(409, motivo);
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
