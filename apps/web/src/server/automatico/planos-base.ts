import { asc, eq, inArray } from "drizzle-orm";
import {
  type BibliaContinuidad,
  type EscenaParaPlano,
  type EstadoPlanoBase,
  leerBibliaContinuidad,
  type PlanoBaseGuardado,
  type PlanoBaseVista,
  type PlanoNecesario,
  type PlanosBaseVista,
  planosNecesarios,
  TEXTO_SIN_PLANO,
  tieneBiblia,
} from "@/lib/continuidad";
import { faltaDeVoz, type HablanteConVoz, usaIdentidadRegistrada } from "@/lib/omni";
import { leerAjustes } from "../ajustes";
import { combinarLugarConIdentidad } from "../ajustes-omni";
import { proyectoPropio, proyectoPropioBloqueado } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import {
  characters,
  type FilaEscena,
  type FilaProyecto,
  type FilaTrabajo,
  generationJobs,
  media,
  projects,
  scenes,
} from "../db/esquema";
import {
  claveDerivada,
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirDerechos,
  exigirRevisionDeReferencias,
} from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { exigirSelloVigente } from "../generacion/precios";
import { lugarDeLaEscena } from "../lugares/para-generar";
import { eleccionDeGeneracion } from "../mapa/generacion";
import { type Actor, aDto } from "../media/servicio";
import { ErrorOmni } from "../omni/errores";
import { eleccionOmni } from "../omni/registro";
import { personajeDelPlano } from "../omni/reparto";
import { registrarPersonajeOmni } from "../personajes/omni";
import { encolarFotograma } from "../produccion/producir";
import { creditosDelEnvio } from "../prompts/traduccion";
import { miembrosDelReparto } from "../reparto/consulta";
import { huellaActual, planosCaducados, retirarPlanosCaducados } from "./huella-plano";

/**
 * **Planos base de un vídeo completo**: un fotograma por personaje que sale solo en alguna escena con lugar,
 * situado en ese lugar con su vestuario fijo, del que arrancan todos los clips de ese plano.
 *
 * - **Qué planos**: los decide `lib/continuidad.ts › planosNecesarios` (1 en una persona, 2 en un podcast, ninguno
 *   en una entrevista, donde los dos comparten plano). Sin lugar no hay plano base.
 * - **Cómo se generan**: con el camino de siempre del fotograma de una escena (`produccion/producir.ts ›
 *   encolarFotograma` → `generacion/servicio.ts › crearFotograma`), con la primera escena del plano, el personaje
 *   del plano y su vestuario de la biblia en el hueco de vestuario de las 6C. Toda la puerta de dinero es la de
 *   cualquier fotograma: confirmación con sello, idempotencia, motor de controles, reserva y topes.
 * - **Se guardan** en la biblia del proyecto (qué trabajo y qué medio) y, cuando una persona lo da por bueno, como
 *   fotograma aprobado de **todas** las escenas del plano (`approvedFrameMediaId`): las escenas de un plano
 *   comparten el mismo medio. El fotograma no se aprueba solo.
 * - **Idempotente por proyecto**: un plano con su trabajo en marcha, listo o aprobado no se vuelve a pedir; repetir
 *   la misma confirmación devuelve lo que ya se encoló.
 * - **Registro antes de gastar**: quien salga en el vídeo y no esté registrado con su voz se registra antes (no
 *   cuesta créditos). Si no se puede, se dice por qué y no se encola nada.
 */

/** Lo que el navegador confirma para pedir los planos que faltan: la confirmación de siempre, por el total. */
export interface ConfirmacionPlanosBase {
  derechos: boolean;
  /** Casilla de la marca: la exige el fotograma si la escena del plano lleva un producto con marca. */
  derechoMarca?: boolean;
  sinTerceros: boolean;
  /** Total de los planos que faltan por pedir, el que se enseñó. */
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
}

/** Escenas del proyecto en su orden. */
async function escenasDe(proyectoId: string): Promise<FilaEscena[]> {
  return db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).orderBy(asc(scenes.sortOrder));
}

/**
 * Lo que hace falta de cada escena para decidir su plano: quién sale (el personaje del plano en un podcast, el
 * protagonista en una escena de uno, los dos en una entrevista) y si tiene lugar.
 */
export async function escenasParaPlanos(
  proyecto: FilaProyecto,
  escenas: readonly FilaEscena[],
): Promise<EscenaParaPlano[]> {
  return Promise.all(
    escenas.map(async (escena) => {
      const personajes =
        escena.castFormat === "solo"
          ? [(await personajeDelPlano(escena)) ?? proyecto.mainCharacterId].filter((id): id is string => id !== null)
          : (await miembrosDelReparto(escena.id)).map((m) => m.personajeId);
      const lugar = lugarDeLaEscena(escena, proyecto.defaultPlaceId);
      return { id: escena.id, personajes, conLugar: lugar.lugarId !== null && !lugar.soloLugar };
    }),
  );
}

/** Coste de un plano base: lo que cuesta un fotograma con el mapa de imagen del usuario, con su traducción. */
export async function costeDeUnPlanoBase(
  usuarioId: string,
): Promise<{ creditos: number; sello: string; comprobado: string } | null> {
  try {
    const { elegida } = await eleccionDeGeneracion(usuarioId, "fotograma", null, {});
    const precio = elegida.eleccion.precio;
    return {
      creditos: await creditosDelEnvio(Math.ceil(precio.creditos)),
      sello: precio.sello,
      comprobado: precio.comprobado,
    };
  } catch {
    return null;
  }
}

/** Motivo por el que el proyecto no prepara planos base ahora; `null` si puede. */
function motivoDelProyecto(proyecto: FilaProyecto, biblia: BibliaContinuidad): string | null {
  if (proyecto.voiceMode !== "omni") {
    return "Los planos base son de los vídeos con voz e identidad registradas. Este proyecto usa otro modo de voz.";
  }
  if (!tieneBiblia(biblia)) {
    return "Los planos base se preparan en los vídeos completos que escribe el asistente desde tu idea. Escribe el guion completo en el paso de la idea.";
  }
  if (proyecto.planApprovedAt === null) {
    return "Aprueba el plan antes de preparar los planos base: cada uno es un fotograma y cuesta créditos.";
  }
  return null;
}

/** Estado de un plano a partir de su trabajo, de lo aprobado y de si sigue correspondiendo a lo de ahora. */
function estadoDelPlano(
  guardado: PlanoBaseGuardado | undefined,
  trabajo: FilaTrabajo | undefined,
  caducado = false,
): { estado: EstadoPlanoBase; medioId: string | null; motivo: string } {
  if (caducado) {
    return {
      estado: "sin_pedir",
      medioId: null,
      motivo:
        "La ficha del personaje, el lugar o su ropa han cambiado desde que se generó, así que ya no vale y sus escenas han dejado de arrancar de él. Vuelve a pedirlo confirmando su coste.",
    };
  }
  if (!guardado?.trabajoId || !trabajo) return { estado: "sin_pedir", medioId: null, motivo: "" };
  if (trabajo.state === "listo" && trabajo.resultMediaId) {
    const aprobado = guardado.medioId === trabajo.resultMediaId;
    return { estado: aprobado ? "aprobado" : "listo", medioId: trabajo.resultMediaId, motivo: "" };
  }
  if (trabajo.state === "fallido" || trabajo.state === "cancelado") {
    return {
      estado: "fallido",
      medioId: null,
      motivo: trabajo.errorMessage || "El fotograma no ha salido. Puedes volver a pedirlo confirmando su coste.",
    };
  }
  return { estado: "en_marcha", medioId: null, motivo: "" };
}

interface Lectura {
  proyecto: FilaProyecto;
  biblia: BibliaContinuidad;
  escenas: FilaEscena[];
  planos: (PlanoNecesario & {
    guardado: PlanoBaseGuardado | undefined;
    trabajo: FilaTrabajo | undefined;
    caducado: boolean;
  })[];
  sinPlano: { escenaId: string; motivo: keyof typeof TEXTO_SIN_PLANO }[];
}

async function leer(actor: Actor, proyectoId: unknown): Promise<Lectura> {
  // Lo caducado se retira antes de leer nada: sus escenas no pueden seguir arrancando de un fotograma que ya no vale.
  await retirarPlanosCaducados(await proyectoPropio(actor, proyectoId));
  const proyecto = await proyectoPropio(actor, proyectoId);
  const biblia = leerBibliaContinuidad(proyecto.continuityBible);
  const escenas = await escenasDe(proyecto.id);
  const caducados = new Set((await planosCaducados(proyecto, biblia, escenas)).map((p) => p.personajeId));
  const { planos, sinPlano } = planosNecesarios(await escenasParaPlanos(proyecto, escenas));
  const ids = biblia.planos.map((p) => p.trabajoId).filter((id): id is string => id !== null);
  const trabajos =
    ids.length === 0 ? [] : await db().select().from(generationJobs).where(inArray(generationJobs.id, ids));
  return {
    proyecto,
    biblia,
    escenas,
    planos: planos.map((plano) => {
      const guardado = biblia.planos.find((p) => p.personajeId === plano.personajeId);
      return {
        ...plano,
        guardado,
        trabajo: trabajos.find((t) => t.id === guardado?.trabajoId),
        caducado: caducados.has(plano.personajeId),
      };
    }),
    sinPlano,
  };
}

/**
 * Los planos base solo si el proyecto es un vídeo completo (tiene biblia); `null` en cualquier otro, sin leer nada
 * más. Es lo que carga la página de producción.
 */
export async function planosBaseDelVideo(actor: Actor, proyectoId: unknown): Promise<PlanosBaseVista | null> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  if (proyecto.voiceMode !== "omni" || !tieneBiblia(leerBibliaContinuidad(proyecto.continuityBible))) return null;
  return planosBaseDe(actor, proyecto.id);
}

/** Lo que enseña la pantalla: qué planos hacen falta, en qué punto está cada uno y lo que cuestan los que faltan. */
export async function planosBaseDe(actor: Actor, proyectoId: unknown): Promise<PlanosBaseVista> {
  const lectura = await leer(actor, proyectoId);
  const { proyecto, escenas, planos } = lectura;
  const orden = new Map(escenas.map((e) => [e.id, e.sortOrder]));
  const nombres = await nombresDe(planos.map((p) => p.personajeId));
  const estados = planos.map((p) => ({ plano: p, ...estadoDelPlano(p.guardado, p.trabajo, p.caducado) }));
  const medioIds = estados.map((e) => e.medioId).filter((id): id is string => id !== null);
  const medios =
    medioIds.length === 0
      ? new Map()
      : new Map(
          (await db().select().from(media).where(inArray(media.id, medioIds))).map((m) => [m.id, aDto(m, actor)]),
        );
  const porPedir = estados.filter((e) => e.estado === "sin_pedir" || e.estado === "fallido").length;
  const unPlano = porPedir > 0 ? await costeDeUnPlanoBase(actor.id) : null;
  return {
    videoCompleto: tieneBiblia(lectura.biblia),
    motivo: motivoDelProyecto(proyecto, lectura.biblia),
    planos: estados.map(
      (e): PlanoBaseVista => ({
        personajeId: e.plano.personajeId,
        nombre: nombres.get(e.plano.personajeId) ?? "Personaje",
        escenas: e.plano.escenas.map((id) => orden.get(id) ?? 0),
        estado: e.estado,
        medio: e.medioId ? (medios.get(e.medioId) ?? null) : null,
        motivo: e.motivo,
      }),
    ),
    sinPlano: lectura.sinPlano.map((s) => ({ orden: orden.get(s.escenaId) ?? 0, motivo: TEXTO_SIN_PLANO[s.motivo] })),
    coste:
      porPedir === 0
        ? { creditosPorPlano: 0, porPedir: 0, total: 0, sello: "", comprobado: "" }
        : unPlano
          ? {
              creditosPorPlano: unPlano.creditos,
              porPedir,
              total: unPlano.creditos * porPedir,
              sello: unPlano.sello,
              comprobado: unPlano.comprobado,
            }
          : null,
    combinado: combinarLugarConIdentidad(await leerAjustes(), true),
  };
}

async function nombresDe(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const filas = await db()
    .select({ id: characters.id, nombre: characters.name })
    .from(characters)
    .where(inArray(characters.id, [...ids]));
  return new Map(filas.map((f) => [f.id, f.nombre]));
}

/**
 * Registra con su voz, **antes de gastar nada**, a quien salga en el vídeo y no lo esté (no cuesta créditos). Antes
 * de registrar a nadie comprueba que cada uno tiene con qué voz hablar y que dos no comparten la misma: registrar a
 * alguien con una voz que no sirve solo crearía una identidad que la producción rechazaría después.
 */
export async function asegurarRegistros(
  actor: Actor,
  proyecto: FilaProyecto,
  escenas: readonly EscenaParaPlano[],
  h: Herramientas = HERRAMIENTAS,
): Promise<string[]> {
  const ids = [...new Set(escenas.flatMap((e) => e.personajes))];
  if (ids.length === 0) return [];
  // Solo los motores de identidad registrada registran a nadie: los de referencias ponen la cara con fotos y la voz
  // con una muestra, y registrar ahí enviaría una cara al proveedor para nada.
  const modelo = await eleccionOmni(actor.id, undefined, proyecto).then(
    (e) => e.modelo.modelo,
    () => "",
  );
  if (!usaIdentidadRegistrada(modelo)) return [];
  const hablantes: HablanteConVoz[] = await db()
    .select({ personajeId: characters.id, nombre: characters.name, audioIdPropio: characters.omniAudioId })
    .from(characters)
    .where(inArray(characters.id, ids));
  for (const quien of hablantes) {
    const falta = faltaDeVoz(quien, hablantes, proyecto.omniAudioId, proyecto.mainCharacterId);
    if (falta !== "") throw new ErrorOmni(409, `«${quien.nombre}» ${falta} No se ha encolado nada ni cobrado nada.`);
  }
  const registrados: string[] = [];
  for (const quien of hablantes) {
    try {
      await registrarPersonajeOmni(actor, quien.personajeId, proyecto.omniAudioId, h, proyecto);
      registrados.push(quien.personajeId);
    } catch (error) {
      if (error instanceof ErrorOmni) {
        throw new ErrorOmni(
          error.estado,
          `Antes de preparar nada hay que registrar a «${quien.nombre}» con su voz, y no se ha podido: ${error.message} No se ha encolado nada ni cobrado nada.`,
        );
      }
      throw error;
    }
  }
  return registrados;
}

/**
 * Pide los planos base que faltan (sin pedir o fallidos) con **una** confirmación por el total. Cada plano es un
 * fotograma con su propia clave derivada y su propia reserva: uno que no se puede encolar no tira los ya
 * encolados, y se dice en `fallo`.
 */
export async function encolarPlanosBase(
  actor: Actor,
  proyectoId: unknown,
  confirmacion: ConfirmacionPlanosBase,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ vista: PlanosBaseVista; nuevos: number; fallo: string | null }> {
  exigirDerechos(confirmacion.derechos);
  exigirRevisionDeReferencias(confirmacion.sinTerceros);
  const clave = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const lectura = await leer(actor, proyectoId);
  const { proyecto, escenas } = lectura;
  const motivo = motivoDelProyecto(proyecto, lectura.biblia);
  if (motivo) throw new ErrorProyecto(409, `${motivo} No se ha cobrado nada.`);
  const porPedir = lectura.planos.filter((p) => {
    const { estado } = estadoDelPlano(p.guardado, p.trabajo, p.caducado);
    return estado === "sin_pedir" || estado === "fallido";
  });
  if (porPedir.length === 0) return { vista: await planosBaseDe(actor, proyecto.id), nuevos: 0, fallo: null };

  const coste = await costeDeUnPlanoBase(actor.id);
  if (!coste) {
    throw new ErrorProyecto(
      409,
      "No hay ningún modelo de imagen con precio utilizable en tu mapa, así que no se puede estimar ni pedir el plano base. No se ha cobrado nada: revisa tu mapa de modelos en «Tu cuenta».",
    );
  }
  // El precio que se enseñó tiene que ser el vigente: si ha cambiado, se rechaza y se vuelve a enseñar.
  exigirSelloVigente(confirmacion.selloEstimacion, coste.sello, true);
  const total = coste.creditos * porPedir.length;
  exigirConfirmacion(confirmacion.creditosConfirmados, total);
  await exigirAvisoUmbral(total, confirmacion.avisoUmbralAceptado);
  await asegurarRegistros(actor, proyecto, await escenasParaPlanos(proyecto, escenas), h);

  const porId = new Map(escenas.map((e) => [e.id, e]));
  let nuevos = 0;
  let fallo: string | null = null;
  for (const plano of porPedir) {
    const primera = porId.get(plano.escenas[0] ?? "");
    if (!primera) continue;
    /**
     * Clave propia de cada plano **y de cada intento**: lleva el trabajo anterior del plano, así que repetir la misma
     * confirmación no encola otro, pero volver a pedir uno fallido o caducado sí, aunque la pantalla repita la clave.
     */
    const claveDelPlano = claveDerivada(clave, "plano-base", plano.personajeId, plano.guardado?.trabajoId ?? "primera");
    const huella = await huellaActual(proyecto, lectura.biblia, plano.personajeId, primera);
    try {
      const trabajoId = await encolarFotograma(
        actor,
        primera,
        { ...proyecto, mainCharacterId: plano.personajeId },
        {
          derechos: confirmacion.derechos,
          ...(confirmacion.derechoMarca === undefined ? {} : { derechoMarca: confirmacion.derechoMarca }),
          sinTerceros: confirmacion.sinTerceros,
          creditosConfirmados: coste.creditos,
          selloEstimacion: confirmacion.selloEstimacion,
          claveIdempotencia: claveDelPlano,
          ...(confirmacion.avisoUmbralAceptado === undefined
            ? {}
            : { avisoUmbralAceptado: confirmacion.avisoUmbralAceptado }),
          ...(confirmacion.avisosConfirmados ? { avisosConfirmados: confirmacion.avisosConfirmados } : {}),
        },
        claveDelPlano,
        h,
        false,
        lectura.biblia.vestuario[plano.personajeId] ?? "",
      );
      await guardarPlano(actor, proyecto.id, {
        personajeId: plano.personajeId,
        trabajoId,
        medioId: null,
        escenaId: primera.id,
        huella,
      });
      nuevos++;
    } catch (error) {
      if (nuevos === 0) throw error;
      fallo = `El plano base de un personaje no se ha podido encolar y los demás siguen en marcha: ${(error as Error).message}`;
      break;
    }
  }
  return { vista: await planosBaseDe(actor, proyecto.id), nuevos, fallo };
}

/**
 * Da por bueno el plano base de un personaje: su fotograma pasa a ser el fotograma aprobado de **todas** las escenas
 * del plano que aún no tienen clip. No gasta nada. Repetirlo no cambia nada.
 */
export async function aprobarPlanoBase(
  actor: Actor,
  proyectoId: unknown,
  personajeId: unknown,
): Promise<PlanosBaseVista> {
  const lectura = await leer(actor, proyectoId);
  const plano = lectura.planos.find((p) => p.personajeId === personajeId);
  if (!plano) throw new ErrorProyecto(404, "Ese plano base no existe en este proyecto.");
  const { estado, medioId } = estadoDelPlano(plano.guardado, plano.trabajo, plano.caducado);
  if ((estado !== "listo" && estado !== "aprobado") || !medioId || !plano.trabajo) {
    throw new ErrorProyecto(
      409,
      "Espera a que el plano base esté listo antes de darlo por bueno. No se ha cobrado nada.",
    );
  }
  const trabajoId = plano.trabajo.id;
  await db().transaction(async (tx) => {
    const bloqueado = await proyectoPropioBloqueado(actor, lectura.proyecto.id, tx);
    const sinClip = lectura.escenas.filter((e) => plano.escenas.includes(e.id) && e.clipMediaId === null);
    if (sinClip.length > 0) {
      await tx
        .update(scenes)
        .set({ approvedFrameMediaId: medioId, approvedFrameJobId: trabajoId, updatedAt: new Date() })
        .where(
          inArray(
            scenes.id,
            sinClip.map((e) => e.id),
          ),
        );
    }
    const biblia = leerBibliaContinuidad(bloqueado.continuityBible);
    await tx
      .update(projects)
      .set({
        continuityBible: conPlano(biblia, {
          personajeId: plano.personajeId,
          trabajoId,
          medioId,
          escenaId: plano.guardado?.escenaId ?? null,
          huella: plano.guardado?.huella ?? "",
        }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, bloqueado.id));
  });
  return planosBaseDe(actor, lectura.proyecto.id);
}

/** La biblia con un plano puesto o sustituido. */
export const conPlano = (biblia: BibliaContinuidad, plano: PlanoBaseGuardado): BibliaContinuidad => ({
  ...biblia,
  planos: [...biblia.planos.filter((p) => p.personajeId !== plano.personajeId), plano],
});

/** Apunta en la biblia el trabajo encargado de un plano, con la fila del proyecto bloqueada. */
async function guardarPlano(actor: Actor, proyectoId: string, plano: PlanoBaseGuardado): Promise<void> {
  await db().transaction(async (tx) => {
    const bloqueado = await proyectoPropioBloqueado(actor, proyectoId, tx);
    await tx
      .update(projects)
      .set({ continuityBible: conPlano(leerBibliaContinuidad(bloqueado.continuityBible), plano) })
      .where(eq(projects.id, bloqueado.id));
  });
}
