import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { formatearCreditos } from "@/lib/generacion";
import { CONCEPTO_MAXIMO } from "@/lib/proyectos";
import {
  type BibliaGuion,
  bloquesDe,
  type ClipGuion,
  type CondicionesVideoCompleto,
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
import { ErrorDeTexto, pedirTextoPorMapa, type TextoDelMapa } from "../mapa/texto";
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

/** Clave de la primera llamada del guion: si ya existe, esta confirmación ya se ejecutó. */
export const clavePrimeraLlamada = (video: VideoPedido, claveIdempotencia: string): string =>
  `${porBloques(video.duracion) ? `${claveIdempotencia}:biblia` : claveIdempotencia}:0`;

interface Contexto {
  actor: Actor;
  proyecto: FilaProyecto;
  video: VideoPedido;
  claveIdempotencia: string;
  buscar: Buscador;
  /** Modelo de pago cuyo precio se confirmó: puede escribir si la principal de cuota falla. */
  reservaConfirmada: string;
}

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
    const claveDe = (intento: number) => `${ctx.claveIdempotencia}${sufijo}${intento === 0 ? "" : `:r${intento}`}`;
    try {
      const { valor, respuesta, intento } = await trozoConReintento({
        reserva,
        pedir: async (intento, causa) => {
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
  if (!porBloques(video.duracion)) {
    const leido = await trozo(
      "",
      "el guion",
      INSTRUCCIONES_CLIPS,
      (causaReintento) =>
        peticionDeClips({ ...datosComunes, clips: plan, ...(causaReintento ? { causaReintento } : {}) }),
      (texto) => leerBloque(texto, plan),
    );
    concepto = leido.concepto;
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
  const escritas = await db().transaction(async (tx) => {
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
        updatedAt: new Date(),
      })
      .where(eq(projects.id, proyecto.id));
    return total;
  });
  const ultima = await ejecucionDeLaConfirmacion(ctx.actor.id, ultimaClave);
  if (ultima) await db().update(assistantRuns).set({ scenesProposed: escritas }).where(eq(assistantRuns.id, ultima.id));
  return { aviso: [...new Set(hechas.map((h) => h.aviso).filter((a) => a !== ""))].join(" ") };
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
      reservaConfirmada: ctx.reservaConfirmada,
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
