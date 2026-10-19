import { randomUUID } from "node:crypto";
import { and, desc, eq, like } from "drizzle-orm";
import type { BibliaContinuidad } from "@/lib/continuidad";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { formatearCreditos } from "@/lib/generacion";
import { CONCEPTO_MAXIMO } from "@/lib/proyectos";
import {
  type BibliaGuion,
  bloquesDe,
  type ClipGuion,
  type CondicionesVideoCompleto,
  type ContinuidadGuion,
  type DuracionVideo,
  ErrorTrozoInservible,
  escenasDeLosClips,
  esDuracionVideo,
  esTipoPieza,
  type Hablante,
  LLAMADAS_DE_RESERVA,
  leerBiblia,
  leerBloque,
  motivoDelProyecto,
  motivoDuracion,
  motivoTipo,
  planDeClips,
  porBloques,
  type ReservaDeLlamadas,
  type TipoPieza,
  tipoConDosPersonas,
  trozoConReintento,
  ultimosTurnos,
} from "@/lib/video-completo";
import { type Ajustes, leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { assistantRuns, type FilaProyecto, projects } from "../db/esquema";
import { limitesDe } from "../limites-proyecto";
import { ErrorDeTexto, pedirTextoPorMapa, type TechoPorLlamada, type TextoDelMapa } from "../mapa/texto";
import type { Actor } from "../media/servicio";
import { esLectorAdmin } from "../modelo-en-mensajes";
import { filaPropia } from "../personajes/consulta";
import { contextoDeVersion } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { exigirPersonajeUsable } from "../personajes/puede-generar";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorProyecto } from "./errores";
import { sustituirEscenasDelGuion } from "./escenas";
import { ejecucionDeLaConfirmacion } from "./gasto";
import {
  INSTRUCCIONES_BIBLIA,
  INSTRUCCIONES_CLIPS,
  type PersonajeDelPrompt,
  peticionDeBiblia,
  peticionDeClips,
} from "./instrucciones-guion";

/**
 * **El guion de un vídeo completo**: diálogo continuo escrito por el modelo de texto, un clip por escena.
 *
 * - **20 s**: una sola llamada con todos los clips;
 * - **≈ 1 min y ≈ 3 min** (ocultos tras el ajuste del admin): una *biblia* corta (concepto, personajes con su
 *   vestuario, lugar y el objetivo de cada bloque) y después **bloques de ≤ 8 clips** en orden, cada uno con la
 *   biblia y los últimos turnos del anterior. Salidas pequeñas: no se cortan en la práctica y repetir una es barato.
 *
 * Un trozo que llega cortado, con otro número de clips o con un clip que no cabe en sus segundos se repite **solo
 * ese trozo**, una vez, con la causa; la repetición sale de la **llamada de reserva** que se confirmó aparte, así
 * que el gasto nunca pasa de lo confirmado. Si vuelve a fallar, se dice con la causa, el proveedor y lo cobrado, y
 * **no se guarda nada**: el guion se escribe entero al final, en una sola transacción.
 *
 * Cada llamada recorre el mapa de modelos de texto con su propia clave de idempotencia, derivada de la que firmó el
 * navegador, y reserva y cierra su gasto ella sola: un error a mitad deja cerradas las llamadas hechas con lo que
 * costaron. La confirmación, el tope, el ritmo y la clave ya los ha comprobado quien llama (`generar.ts`).
 */

/** Un personaje del guion: su letra, su fila y su ficha ya compuesta. */
export interface PersonajeDelGuion extends PersonajeDelPrompt {
  id: string;
}

/** Lo que se ha pedido, ya comprobado. */
export interface VideoPedido {
  duracion: DuracionVideo;
  tipo: TipoPieza;
  /** A (el protagonista) y, en entrevista y podcast, B. */
  personajes: PersonajeDelGuion[];
}

/** Las condiciones de un proyecto y de esta instalación para escribir un vídeo completo. */
export const condicionesDe = (proyecto: FilaProyecto, ajustes: Ajustes): CondicionesVideoCompleto => ({
  modoVoz: proyecto.voiceMode,
  tieneProtagonista: proyecto.mainCharacterId !== null,
  largasActivas: ajustes.videoDuracionesLargas,
  podcastActivo: ajustes.repartoPodcastActivo,
  dualcastActivo: ajustes.repartoDualcastActivo,
  ...limitesDe(ajustes),
});

/**
 * Un personaje propio y utilizable, con su ficha vigente. **Se comprueba antes que se puede usar** (consentimiento
 * vigente y fotos suficientes): su ficha describe a una persona y sale de Escenara hacia un proveedor de texto.
 */
async function personajeDelGuion(actor: Actor, personajeId: string, hablante: Hablante): Promise<PersonajeDelGuion> {
  const personaje = await filaPropia(actor, personajeId);
  await exigirPersonajeUsable(personaje.id, personaje.name);
  const version = await ultimaVersion(personaje.id);
  return {
    hablante,
    id: personaje.id,
    nombre: personaje.name,
    contexto: version ? contextoDeVersion(version, personaje.kind) : "",
  };
}

/**
 * Lee y comprueba lo que se pide. **Es la API la que rechaza**, no solo la pantalla: 1 y 3 min con el ajuste
 * apagado, un tipo desactivado o una duración que no cabe en los límites responden con el motivo.
 */
export async function leerVideoPedido(
  actor: Actor,
  proyecto: FilaProyecto,
  datos: { duracion?: unknown; tipo?: unknown; segundoPersonajeId?: unknown },
): Promise<VideoPedido> {
  const duracion = typeof datos.duracion === "string" ? Number(datos.duracion) : datos.duracion;
  if (!esDuracionVideo(duracion)) {
    throw new ErrorProyecto(400, "Esa duración del vídeo no existe: elige una de las que se ofrecen.");
  }
  const tipo = datos.tipo === undefined || datos.tipo === null || datos.tipo === "" ? "una_persona" : datos.tipo;
  if (!esTipoPieza(tipo))
    throw new ErrorProyecto(400, "Ese tipo de vídeo no existe: una persona, entrevista o podcast.");
  const condiciones = condicionesDe(proyecto, await leerAjustes());
  const motivo =
    motivoDelProyecto(condiciones) ?? motivoTipo(tipo, condiciones) ?? motivoDuracion(duracion, tipo, condiciones);
  if (motivo) throw new ErrorProyecto(409, motivo);
  const protagonista = proyecto.mainCharacterId;
  if (!protagonista) throw new ErrorProyecto(409, "Elige primero el protagonista del proyecto.");
  const personajes = [await personajeDelGuion(actor, protagonista, "A")];
  if (tipoConDosPersonas(tipo)) {
    const segundo = datos.segundoPersonajeId;
    if (typeof segundo !== "string" || segundo === "") {
      throw new ErrorProyecto(400, "Elige con quién habla tu protagonista: la entrevista y el podcast son de dos.");
    }
    if (segundo === protagonista) {
      throw new ErrorProyecto(400, "El segundo personaje tiene que ser otro distinto del protagonista.");
    }
    personajes.push(await personajeDelGuion(actor, segundo, "B"));
  }
  return { duracion, tipo, personajes };
}

/**
 * Las llamadas de un vídeo completo llevan `:video` en su clave. Es lo que permite saber, sin columna nueva, que el
 * guion vigente del proyecto lo escribió entero el asistente (y por eso su diálogo va plegado en la pantalla).
 */
const MARCA_VIDEO = ":video";

/** Clave de la primera llamada del guion: si ya existe, esta confirmación ya se ejecutó. */
export const clavePrimeraLlamada = (video: VideoPedido, claveIdempotencia: string): string =>
  `${claveIdempotencia}${MARCA_VIDEO}${porBloques(video.duracion) ? ":biblia" : ""}:0`;

/**
 * `true` si el guion vigente del proyecto es un vídeo completo escrito por el asistente: la última llamada de guion
 * que terminó es de un vídeo completo. Un guion de escenas sueltas escrito después lo desmarca.
 */
export async function guionCompletoVigente(proyectoId: string): Promise<boolean> {
  const [ultima] = await db()
    .select({ clave: assistantRuns.idempotencyKey })
    .from(assistantRuns)
    .where(
      and(eq(assistantRuns.projectId, proyectoId), eq(assistantRuns.kind, "guion"), eq(assistantRuns.state, "listo")),
    )
    .orderBy(desc(assistantRuns.createdAt))
    .limit(1);
  return ultima?.clave.includes(MARCA_VIDEO) ?? false;
}

/**
 * Qué pasó con una confirmación que ya se había ejecutado, para decirlo en lugar de devolver el proyecto sin más.
 * `null` si terminó bien (o sigue en marcha): entonces lo que hay es su resultado.
 */
export async function falloDeUnaConfirmacion(usuarioId: string, claveIdempotencia: string): Promise<string | null> {
  const filas = await db()
    .select({
      estado: assistantRuns.state,
      error: assistantRuns.errorMessage,
      escenas: assistantRuns.scenesProposed,
    })
    .from(assistantRuns)
    .where(
      and(
        eq(assistantRuns.userId, usuarioId),
        like(assistantRuns.idempotencyKey, `${claveIdempotencia}${MARCA_VIDEO}%`),
      ),
    );
  // El guion se guardó (la última llamada apunta sus escenas): un trozo repetido por el camino no es un fallo.
  if (filas.some((f) => (f.escenas ?? 0) > 0)) return null;
  const fallidas = filas.filter((f) => f.estado === "fallido" || (f.error ?? "") !== "");
  if (fallidas.length === 0) return null;
  const listas = filas.filter((f) => f.estado === "listo" && (f.error ?? "") === "").length;
  return `Esta misma confirmación ya se intentó y no terminó: ${listas === 0 ? "ninguna llamada llegó a servir" : `${listas} ${listas === 1 ? "llamada se hizo y se cobró" : "llamadas se hicieron y se cobraron"}`}, pero el guion no se guardó, así que tus escenas siguen como estaban. No se ha vuelto a llamar a nadie ni a cobrar nada. Recarga la página y vuelve a confirmar para intentarlo de nuevo.`;
}

interface Contexto {
  actor: Actor;
  proyecto: FilaProyecto;
  video: VideoPedido;
  claveIdempotencia: string;
  buscar: Buscador;
  /** Total confirmado (llamadas + reserva): lo que no se puede pasar entre todas las llamadas. */
  confirmado: number;
  /**
   * Lo confirmado por llamada, en la moneda de quien cobra: ninguna llamada (ni la principal del mapa ni una
   * reserva) puede costar más. Con la principal de cuota es 0, y entonces solo se prueban entradas de cuota.
   */
  techo: TechoPorLlamada;
}

/**
 * Lo gastado hasta ahora: lo que costó cada llamada que contestó, más una llamada entera por cada intento fallido
 * que pudo cobrar. Es una cuenta prudente: nunca se queda corta.
 */
export const gastoDeLasLlamadas = (
  hechas: readonly Pick<TextoDelMapa, "creditos" | "intentos">[],
  porLlamada: number,
) => hechas.reduce((s, h) => s + h.creditos + h.intentos.filter((i) => i.cobro !== "sin-cobro").length * porLlamada, 0);

/**
 * Escribe el guion entero y lo guarda en una transacción. Devuelve el aviso de reserva de pago, si alguna llamada
 * la escribió una reserva de pago (qué falló, quién la escribió y cuánto costó), o vacío.
 */
export async function escribirVideoCompleto(ctx: Contexto): Promise<{ aviso: string }> {
  const { video, proyecto } = ctx;
  const plan = planDeClips(video.duracion, video.tipo);
  const bloques = bloquesDe(plan);
  const hechas: TextoDelMapa[] = [];
  const reserva: ReservaDeLlamadas = { quedan: LLAMADAS_DE_RESERVA };
  /** Clave de la ejecución que escribió el último trozo útil: ahí se anota cuántas escenas salieron. */
  let ultimaClave = "";

  /** Pide un trozo y lo lee; si no sirve y queda reserva, lo repite una vez con la causa. */
  async function trozo<T>(
    sufijo: string,
    nombre: string,
    instrucciones: string,
    componer: (causa?: string) => string,
    leer: (texto: string) => T,
  ): Promise<T> {
    const claveDe = (intento: number) =>
      `${ctx.claveIdempotencia}${MARCA_VIDEO}${sufijo}${intento === 0 ? "" : `:r${intento}`}`;
    try {
      const { valor, respuesta, intento } = await trozoConReintento({
        reserva,
        pedir: async (intento, causa) => {
          exigirMargen(ctx, nombre, hechas);
          const respuesta = await pedir(ctx, claveDe(intento), instrucciones, componer(causa), nombre, hechas);
          hechas.push(respuesta);
          return respuesta;
        },
        leer,
        alFallar: (intento, respuesta, fallo) => anotarFallo(ctx.actor.id, claveDe(intento), respuesta, fallo.message),
      });
      ultimaClave = `${claveDe(intento)}:${respuesta.intentos.length}`;
      return valor;
    } catch (error) {
      if (error instanceof ErrorTrozoInservible) throw mensajeDeTrozoInservible(ctx.actor, nombre, error, hechas);
      throw error;
    }
  }

  const datosComunes = { idea: proyecto.idea, tipo: video.tipo, personajes: video.personajes };
  let concepto = "";
  const clips: ClipGuion[] = [];
  let continuidad: ContinuidadGuion = { lugar: "", vestuario: {} };
  if (!porBloques(video.duracion)) {
    const leido = await trozo(
      "",
      "el guion",
      INSTRUCCIONES_CLIPS,
      (causaReintento) =>
        peticionDeClips({
          ...datosComunes,
          clips: plan,
          conContinuidad: true,
          ...(causaReintento ? { causaReintento } : {}),
        }),
      (texto) => leerBloque(texto, plan),
    );
    concepto = leido.concepto;
    continuidad = leido.continuidad;
    clips.push(...leido.clips);
  } else {
    const biblia: BibliaGuion = await trozo(
      ":biblia",
      "el plan del guion",
      INSTRUCCIONES_BIBLIA,
      (causaReintento) => peticionDeBiblia({ ...datosComunes, bloques, ...(causaReintento ? { causaReintento } : {}) }),
      (texto) => leerBiblia(texto, bloques.length),
    );
    concepto = biblia.concepto;
    continuidad = {
      lugar: biblia.lugar,
      vestuario: Object.fromEntries(
        biblia.personajes.filter((p) => p.vestuario !== "").map((p) => [p.hablante, p.vestuario]),
      ),
    };
    for (const [indice, bloque] of bloques.entries()) {
      const parte = { numero: indice + 1, total: bloques.length };
      const turnosPrevios = ultimosTurnos(clips);
      const leido = await trozo(
        `:bloque-${parte.numero}`,
        `la parte ${parte.numero} de ${parte.total} del guion`,
        INSTRUCCIONES_CLIPS,
        (causaReintento) =>
          peticionDeClips({
            ...datosComunes,
            clips: bloque,
            biblia,
            parte,
            turnosPrevios,
            ...(causaReintento ? { causaReintento } : {}),
          }),
        (texto) => leerBloque(texto, bloque),
      );
      clips.push(...leido.clips);
    }
  }

  const personajes = { A: video.personajes[0]?.id ?? null, B: video.personajes[1]?.id ?? null };
  const escenas = escenasDeLosClips(clips, video.tipo, personajes, video.tipo === "podcast" ? randomUUID() : null);
  const escritas = await guardarSinPerderLoCobrado(hechas, () =>
    db().transaction(async (tx) => {
      const total = await sustituirEscenasDelGuion(tx, proyecto.id, escenas);
      /**
       * La duración de clip del proyecto pasa a ser la del primer clip (10 s en una persona y entrevista, 8 s en el
       * resto): así el plan, la rejilla de producción y la confirmación hablan de la misma tarifa que cada escena.
       * Solo el podcast de 20 s mezcla duraciones (8 + 6 + 6 s), y cada escena guarda la suya.
       */
      await tx
        .update(projects)
        .set({
          clipSeconds: plan[0]?.segundos ?? proyecto.clipSeconds,
          ...(concepto === "" ? {} : { concept: limpiarTextoDePrompt(concepto, CONCEPTO_MAXIMO) }),
          // Vestuario y lugar fijos de este guion; los planos base de un guion anterior ya no valen: otras escenas.
          continuityBible: bibliaDelGuion(continuidad, personajes),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, proyecto.id));
      return total;
    }),
  );
  const ultima = await ejecucionDeLaConfirmacion(ctx.actor.id, ultimaClave);
  if (ultima) await db().update(assistantRuns).set({ scenesProposed: escritas }).where(eq(assistantRuns.id, ultima.id));
  return { aviso: [...new Set(hechas.map((h) => h.aviso).filter((a) => a !== ""))].join(" ") };
}

/** La biblia de continuidad que se guarda con el guion: el vestuario pasa de letras («A», «B») a personajes. */
export function bibliaDelGuion(
  continuidad: ContinuidadGuion,
  personajes: Readonly<Record<Hablante, string | null>>,
): BibliaContinuidad {
  const vestuario: Record<string, string> = {};
  for (const hablante of ["A", "B"] as const) {
    const id = personajes[hablante];
    const ropa = continuidad.vestuario[hablante];
    if (id && ropa) vestuario[id] = ropa;
  }
  return { lugar: continuidad.lugar, vestuario, planos: [] };
}

/**
 * Guarda el guion. Si la escritura falla (alguien empezó a producir una escena mientras se escribía), las llamadas ya
 * están hechas y cobradas: el error lo dice, además de su causa.
 */
async function guardarSinPerderLoCobrado<T>(hechas: readonly TextoDelMapa[], guardar: () => Promise<T>): Promise<T> {
  try {
    return await guardar();
  } catch (error) {
    if (error instanceof ErrorProyecto) {
      throw new ErrorProyecto(error.estado, `${error.message} No se ha guardado el guion.${loYaCobrado(hechas)}`);
    }
    throw error;
  }
}

/**
 * Antes de cada llamada: si la siguiente pudiera pasar de lo confirmado (porque alguna anterior costó más de lo
 * estimado), se para aquí, sin llamar, con la causa, el proveedor y lo ya cobrado.
 */
function exigirMargen(ctx: Contexto, nombre: string, hechas: readonly TextoDelMapa[]): void {
  const gastado = gastoDeLasLlamadas(hechas, ctx.techo.creditos);
  if (gastado + ctx.techo.creditos <= ctx.confirmado) return;
  const proveedor = hechas.at(-1)?.nombreProveedor;
  throw new ErrorProyecto(
    409,
    `Se ha parado antes de escribir ${nombre}: las llamadas hechas${proveedor ? ` a ${proveedor}` : ""} han costado más de lo estimado y la siguiente podría pasar de los ${formatearCreditos(ctx.confirmado)} que confirmaste, así que no se ha hecho. No se ha guardado nada.${loYaCobrado(hechas)} Vuelve a intentarlo con una confirmación nueva: el coste que verás ya será el vigente.`,
  );
}

/** Una llamada por el mapa de texto. Un fallo del proveedor se dice con el trozo, la causa y lo ya cobrado. */
async function pedir(
  ctx: Contexto,
  claveIdempotencia: string,
  instrucciones: string,
  entrada: string,
  nombre: string,
  hechas: readonly TextoDelMapa[],
): Promise<TextoDelMapa> {
  try {
    return await pedirTextoPorMapa({
      usuarioId: ctx.actor.id,
      proyectoId: ctx.proyecto.id,
      kind: "guion",
      instrucciones,
      entrada,
      claveIdempotencia,
      buscar: ctx.buscar,
      techoPorLlamada: ctx.techo,
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) {
      throw new ErrorProyecto(
        502,
        `${error.mensaje(`No se ha podido escribir ${nombre}, así que el proyecto se ha quedado como estaba`)}${loYaCobrado(hechas)}`,
      );
    }
    if (error instanceof ErrorCatalogo) throw new ErrorProyecto(error.estado, error.message);
    throw error;
  }
}

/** Lo que ya habían costado las llamadas hechas antes del fallo, para que nadie tenga que adivinarlo. */
function loYaCobrado(hechas: readonly TextoDelMapa[]): string {
  if (hechas.length === 0) return "";
  const creditos = hechas.reduce((s, h) => s + h.creditos, 0);
  const una = hechas.length === 1;
  const sujeto = una ? "La llamada que ya se había hecho" : `Las ${hechas.length} llamadas que ya se habían hecho`;
  const coste =
    creditos === 0
      ? `no ${una ? "ha" : "han"} costado créditos (se pagan por la cuota de tu plan)`
      : `${una ? "ha" : "han"} costado ${formatearCreditos(creditos)} en total, dentro de lo que confirmaste`;
  return ` ${sujeto} ${coste}; lo que ${una ? "escribió" : "escribieron"} no se ha guardado.`;
}

function mensajeDeTrozoInservible(
  actor: Actor,
  nombre: string,
  error: ErrorTrozoInservible<TextoDelMapa>,
  hechas: readonly TextoDelMapa[],
): ErrorProyecto {
  const { respuesta } = error;
  const quien = esLectorAdmin(actor)
    ? `${respuesta.nombreProveedor} (${respuesta.modelo})`
    : `El servicio de texto de ${respuesta.nombreProveedor}`;
  const repeticion = error.repetido
    ? "Se ha repetido una vez con la causa y tampoco ha servido."
    : "Ya no quedaba llamada de reserva para repetirlo dentro de lo que confirmaste.";
  return new ErrorProyecto(
    502,
    `${quien} ha contestado, pero ${nombre} no se pudo usar: ${error.message}. ${repeticion} No se ha guardado nada.${loYaCobrado(hechas)} Vuelve a intentarlo; si se repite, pon otra entrada en tu mapa de modelos de texto en «Tu cuenta».`,
  );
}

/**
 * Anota en la ejecución que contestó por qué no se pudo usar lo que escribió. La llamada ya está hecha y su gasto
 * cerrado con lo que costó: esto es solo para quien mire su historial.
 */
async function anotarFallo(usuarioId: string, base: string, respuesta: TextoDelMapa, mensaje: string): Promise<void> {
  const ejecucion = await ejecucionDeLaConfirmacion(usuarioId, `${base}:${respuesta.intentos.length}`);
  if (ejecucion) {
    await db().update(assistantRuns).set({ errorMessage: mensaje }).where(eq(assistantRuns.id, ejecucion.id));
  }
}
