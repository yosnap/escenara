import { eq } from "drizzle-orm";
import { ErrorPropuesta, INSTRUCCIONES_ASISTENTE, leerPropuesta, peticionDeGuion } from "@/lib/asistente";
import { esProveedor } from "@/lib/boveda";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { CONCEPTO_MAXIMO, ESCENAS_SUGERIDAS, type ProyectoDetalle } from "@/lib/proyectos";
import { costeDeEscenasSueltas, costeDelGuion } from "@/lib/video-completo";
import { motivoSinDeclaracion } from "../anuncio/puerta-guion";
import { db } from "../db/cliente";
import { assistantRuns, type FilaProyecto, projects } from "../db/esquema";
import { exigirClaveIdempotencia, exigirConfirmacion, exigirSaldo } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { dentroDelLimite, type Limite } from "../limite";
import { limitesDeProyecto } from "../limites-proyecto";
import {
  ErrorDeTexto,
  ErrorPeticionRepetida,
  pedirTextoPorMapa,
  type TechoPorLlamada,
  type TextoDelMapa,
} from "../mapa/texto";
import type { Actor } from "../media/servicio";
import { esLectorAdmin } from "../modelo-en-mensajes";
import { filaPropia } from "../personajes/consulta";
import { contextoDeVersion } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { exigirPersonajeUsable } from "../personajes/puede-generar";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";
import { proyectoPropio } from "./consulta";
import { ErrorProyecto } from "./errores";
import { exigirEscenasReescribibles, sustituirEscenas } from "./escenas";
import { ejecucionDeLaConfirmacion } from "./gasto";
import {
  clavePrimeraLlamada,
  escribirVideoCompleto,
  falloDeUnaConfirmacion,
  leerVideoPedido,
  type VideoPedido,
} from "./guion-por-bloques";
import { detalleProyecto, exigirTopeDelProyecto } from "./plan";
import { exigirAsistenteDisponible } from "./texto";

/**
 * El asistente de guion: de una idea a un concepto y un guion por escenas (RF05).
 *
 * **Es el único camino de esta versión que gasta dinero**, así que lo recorre entero, en este orden:
 *
 * 1. proyecto del usuario, con idea escrita;
 * 2. asistente disponible (encendido y con alguna entrada utilizable en el mapa de texto del usuario);
 * 3. **estimación confirmada**: los créditos que el usuario tenía delante (los de la entrada principal de su mapa,
 *    0 si se paga por cuota) y el sello del precio vigente. Si cambió entre la pantalla y el botón, se rechaza y
 *    se vuelve a mostrar;
 * 4. **clave de idempotencia**: la misma confirmación nunca se cobra dos veces;
 * 5. **límite de ritmo** por usuario;
 * 6. **reserva** del coste estimado en el `usage_ledger`, antes de llamar a nadie;
 * 7. la llamada, con la clave del propio usuario y **sin pasar nunca de lo confirmado por llamada**;
 * 8. la respuesta se trata como **propuesta no confiable**: se limpia, se recorta y se guarda como borrador;
 * 9. **cierre del gasto** con los créditos que informa el proveedor.
 *
 * Nada de lo que vuelve del modelo aprueba nada ni encola nada: el plan lo aprueba el usuario después.
 */

/** Ritmo del asistente por usuario: escribir un guion no es algo que se repita veinte veces en una hora. */
export const RITMO_ASISTENTE: Limite = { ventanaSegundos: 60 * 60, maximo: 20 };

export interface PeticionAsistente {
  /** Clave que firma el navegador al confirmar el gasto. */
  claveIdempotencia: unknown;
  /** Créditos estimados que el usuario tenía delante. */
  creditosConfirmados: unknown;
  /** Sello del precio con el que se hizo esa estimación. */
  selloEstimacion: unknown;
  /** Cuántas escenas pedir; sin valor, las sugeridas para el formato del proyecto. */
  escenas?: unknown;
  /**
   * Duración del **vídeo completo** en segundos (20, y 60 o 180 con el ajuste del admin encendido). Con ella el
   * guion se escribe con diálogo continuo, un clip por escena, y `escenas` no cuenta.
   */
  duracion?: unknown;
  /** Tipo de pieza del vídeo completo: `una_persona` (por defecto), `entrevista` o `podcast`. */
  tipo?: unknown;
  /** Con quién habla el protagonista en una entrevista o un podcast: un personaje propio. */
  segundoPersonajeId?: unknown;
}

/**
 * Contexto del protagonista para la petición: la versión vigente de su ficha, o nada si el proyecto no tiene
 * protagonista.
 *
 * **Se comprueba antes que el personaje se puede usar** (consentimiento vigente y fotos suficientes): la ficha
 * describe a una persona, y sale de Escenara hacia un proveedor de texto. Si su consentimiento se ha revocado
 * desde que se asignó, no sale, y se dice con el motivo de siempre en lugar de gastar.
 */
async function contextoDelProtagonista(actor: Actor, proyecto: FilaProyecto): Promise<string> {
  if (!proyecto.mainCharacterId) return "";
  const personaje = await filaPropia(actor, proyecto.mainCharacterId);
  await exigirPersonajeUsable(personaje.id, personaje.name);
  const version = await ultimaVersion(personaje.id);
  return version ? contextoDeVersion(version, personaje.kind) : "";
}

export async function escribirGuion(
  actor: Actor,
  proyectoId: unknown,
  peticion: PeticionAsistente,
  buscar: Buscador = fetch,
): Promise<ProyectoDetalle> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  if (proyecto.idea.trim() === "") {
    throw new ErrorProyecto(400, "Escribe primero la idea del proyecto: es lo que el asistente convierte en guion.");
  }
  // Un ángulo que afirma algo comprobable no se escribe sin su declaración, tampoco por esta ruta (0.27.0).
  const sinDeclaracion = await motivoSinDeclaracion(proyecto.id);
  if (sinDeclaracion !== "") throw new ErrorProyecto(409, sinDeclaracion);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  // Lo que se confirma es lo que costaría la entrada principal del mapa de texto del usuario, que es por donde se
  // va a escribir (0 créditos si se paga por la cuota de su plan), más la llamada de reserva a lo que cueste, como
  // mucho, la reserva de pago de ese mapa.
  const { estimacion, techo, reserva } = await exigirAsistenteDisponible(actor.id);
  // El vídeo completo se comprueba entero antes de mirar el coste: la duración decide cuántas llamadas se pagan, y
  // una duración cerrada por el admin se rechaza con su motivo aunque la pida alguien saltándose la pantalla.
  const video = sinValor(peticion.duracion) ? null : await leerVideoPedido(actor, proyecto, peticion);
  const reservaPorLlamada = reserva?.creditos ?? 0;
  const creditos = video
    ? costeDelGuion(estimacion.creditos, video.duracion, video.tipo, reservaPorLlamada).total
    : costeDeEscenasSueltas(estimacion.creditos, reservaPorLlamada).total;
  /**
   * La cifra se confirma **siempre**, también cuando es 0: así, si el mapa ha cambiado entre la pantalla y el botón
   * (de cuota a pago, o ha aparecido o desaparecido una reserva de pago), las cifras no coinciden y se rechaza para
   * volver a enseñarla. El sello reúne el de la principal y los de las entradas que pueden hacer de reserva de pago
   * (`estadoDelAsistente`): si cualquiera de esos precios cambia, el sello cambia y se rechaza con un 409. Solo está
   * vacío cuando no hay ningún precio que sellar (principal por cuota y ninguna reserva de pago); entonces se exige
   * que tampoco venga ninguno, y lo que protege es la cifra de 0. Lo que nunca se cobra de más lo garantizan además
   * los techos de cada llamada.
   */
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  exigirSelloVigente(peticion.selloEstimacion, estimacion.sello, estimacion.sello !== "");
  // Una confirmación repetida (doble clic, reintento tras un error de red) **no gasta ritmo**: se responde con lo
  // que ya hay. Si no, reintentar un fallo de red podría dejar al usuario sin poder pedir nada durante una hora.
  const yaEjecutada = await ejecucionDeLaConfirmacion(
    actor.id,
    video ? clavePrimeraLlamada(video, claveIdempotencia) : claveIdempotencia,
  );
  if (yaEjecutada) return repetida(actor, proyecto.id, video ? claveIdempotencia : null);
  /**
   * Las validaciones que no gastan van antes que el ritmo, el saldo y la reserva, en este orden: la ficha del
   * protagonista (su consentimiento puede haberse revocado: no sale hacia el proveedor), el tope autorizado del
   * proyecto y, por último, que sus escenas se puedan reescribir. Leer la ficha **antes** de reservar importa: una
   * reserva apartada por un fallo nuestro le comería presupuesto al usuario hasta que el barrido la cerrara.
   */
  const entrada = video ? "" : await entradaDelGuion(actor, proyecto, peticion.escenas);
  // El presupuesto autorizado del proyecto es un **tope que se aplica al gastar**: lo que ya lleva comprometido
  // más esta llamada (o todas las del vídeo completo, reserva incluida) tiene que caber.
  await exigirTopeDelProyecto(actor.id, proyecto.id, creditos);
  // Un proyecto con escenas en producción no se reescribe: se dice antes de gastar ritmo, saldo o una llamada.
  await exigirEscenasReescribibles(proyecto.id);
  if (!(await dentroDelLimite(`asistente:${actor.id}`, RITMO_ASISTENTE))) {
    throw new ErrorProyecto(429, "Has pedido demasiados guiones seguidos. Espera un rato.");
  }
  // Si la principal es de pago y se conoce el saldo del usuario en ese proveedor y no llega, no se llama: el
  // proveedor lo rechazaría y la reserva se habría apartado para nada. Su clave ya la ha comprobado el mapa, que
  // descarta las entradas sin credencial válida; una entrada de cuota no tiene saldo que mirar.
  if (!estimacion.porCuota && esProveedor(techo.proveedor)) {
    await exigirSaldo(actor.id, creditos, buscar, techo.proveedor);
  }
  if (video) return guionDelVideo(actor, proyecto, video, claveIdempotencia, creditos, techo, reserva, buscar);

  // Esta confirmación ya se había ejecutado: se devuelve el proyecto como está y **no se llama a nadie**.
  if (await ejecucionDeLaConfirmacion(actor.id, `${claveIdempotencia}:0`)) return detalleProyecto(actor, proyecto.id);

  /**
   * El guion se pide **recorriendo el mapa de modelos de texto** del usuario (0.21.1): la entrada principal y,
   * si falla de forma que prueba que no cobró, la siguiente. Cada entrada reserva y cierra su propio gasto en su
   * moneda, así que no hay forma de cobrar dos veces ni de sumar créditos de proveedores distintos.
   */
  let resultado: TextoDelMapa;
  try {
    resultado = await pedirTextoPorMapa({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      kind: "guion",
      instrucciones: INSTRUCCIONES_ASISTENTE,
      entrada,
      claveIdempotencia,
      buscar,
      // La principal no puede costar más de su precio confirmado, y una reserva de pago, más de lo que queda del
      // total: aquí no se ha gastado nada todavía, así que es el total entero.
      techoPorLlamada: techo,
      techoReserva: { creditos, proveedor: reserva?.proveedor ?? techo.proveedor },
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) {
      throw new ErrorProyecto(
        502,
        error.mensaje("No se ha podido escribir el guion, así que el proyecto se ha quedado como estaba"),
      );
    }
    // La misma confirmación ya estaba en marcha: se devuelve el proyecto como está y no se llama a nadie.
    if (error instanceof ErrorPeticionRepetida) return detalleProyecto(actor, proyecto.id);
    if (error instanceof ErrorCatalogo) throw new ErrorProyecto(error.estado, error.message);
    throw error;
  }

  const ultima = await ejecucionDeLaConfirmacion(actor.id, `${claveIdempotencia}:${resultado.intentos.length}`);
  try {
    const propuesta = leerPropuesta(resultado.texto, proyecto.clipSeconds, (await limitesDeProyecto()).escenasMaximas);
    const escenasEscritas = await db().transaction(async (tx) => {
      const total = await sustituirEscenas(tx, proyecto.id, propuesta.escenas);
      if (propuesta.concepto !== "") {
        await tx
          .update(projects)
          .set({ concept: limpiarTextoDePrompt(propuesta.concepto, CONCEPTO_MAXIMO), updatedAt: new Date() })
          .where(eq(projects.id, proyecto.id));
      }
      return total;
    });
    // Cuántas escenas propuso es informativo, pero se guarda en la ejecución que de verdad la escribió.
    if (ultima) {
      await db().update(assistantRuns).set({ scenesProposed: escenasEscritas }).where(eq(assistantRuns.id, ultima.id));
    }
  } catch (error) {
    // Lo que contestó no se puede usar, pero la llamada ya está hecha y su gasto ya está cerrado con lo que
    // costó de verdad: aquí solo se anota el motivo para quien mire su historial.
    if (ultima) {
      await db()
        .update(assistantRuns)
        .set({ errorMessage: error instanceof Error ? error.message : "Error interno." })
        .where(eq(assistantRuns.id, ultima.id));
    }
    if (error instanceof ErrorPropuesta) {
      // Se dice **quién** contestó lo que no se pudo usar: con una reserva puesta, no fue la entrada principal.
      throw new ErrorProyecto(
        502,
        `${esLectorAdmin(actor) ? `${resultado.nombreProveedor} (${resultado.modelo})` : `El servicio de texto de ${resultado.nombreProveedor}`} ha contestado, pero su texto no se pudo usar como guion: ${error.message}`,
      );
    }
    throw error;
  }
  const detalle = await detalleProyecto(actor, proyecto.id);
  return resultado.aviso === "" ? detalle : { ...detalle, avisoReserva: resultado.aviso };
}

/**
 * Respuesta a una confirmación que ya se había ejecutado. En un vídeo completo que falló a mitad se dice qué pasó
 * (con un 409, para que la pantalla estrene clave), en lugar de devolver el proyecto como si nada.
 */
async function repetida(actor: Actor, proyectoId: string, claveVideo: string | null): Promise<ProyectoDetalle> {
  const fallo = claveVideo ? await falloDeUnaConfirmacion(actor.id, claveVideo) : null;
  if (fallo) throw new ErrorProyecto(409, fallo);
  return detalleProyecto(actor, proyectoId);
}

/** Petición del guion de escenas sueltas, compuesta por el servidor con la ficha vigente del protagonista. */
async function entradaDelGuion(actor: Actor, proyecto: FilaProyecto, escenas: unknown): Promise<string> {
  const { escenasMaximas } = await limitesDeProyecto();
  return peticionDeGuion({
    idea: proyecto.idea,
    formato: proyecto.format,
    contextoPersonaje: await contextoDelProtagonista(actor, proyecto),
    escenas: numeroDeEscenas(escenas, proyecto),
    segundos: proyecto.clipSeconds,
    escenasMaximas,
  });
}

const sinValor = (valor: unknown) => valor === undefined || valor === null || valor === "";

/**
 * El guion de un vídeo completo. La confirmación, la clave, el ritmo, la credencial y el saldo ya están
 * comprobados; aquí van el tope del proyecto (por el total confirmado, reserva incluida) y la escritura.
 */
async function guionDelVideo(
  actor: Actor,
  proyecto: FilaProyecto,
  video: VideoPedido,
  claveIdempotencia: string,
  creditos: number,
  techo: TechoPorLlamada,
  reserva: TechoPorLlamada | null,
  buscar: Buscador,
): Promise<ProyectoDetalle> {
  // Esta confirmación ya se había ejecutado: se devuelve el proyecto como está y **no se llama a nadie**.
  if (await ejecucionDeLaConfirmacion(actor.id, clavePrimeraLlamada(video, claveIdempotencia))) {
    return repetida(actor, proyecto.id, claveIdempotencia);
  }
  let aviso: string;
  try {
    ({ aviso } = await escribirVideoCompleto({
      actor,
      proyecto,
      video,
      claveIdempotencia,
      buscar,
      confirmado: creditos,
      techo,
      reserva,
    }));
  } catch (error) {
    // La misma confirmación ya estaba en marcha: se devuelve el proyecto como está y no se llama a nadie más.
    if (error instanceof ErrorPeticionRepetida) return detalleProyecto(actor, proyecto.id);
    throw error;
  }
  const detalle = await detalleProyecto(actor, proyecto.id);
  return aviso === "" ? detalle : { ...detalle, avisoReserva: aviso };
}

function numeroDeEscenas(pedidas: unknown, proyecto: FilaProyecto): number {
  if (pedidas === undefined || pedidas === null || pedidas === "") return ESCENAS_SUGERIDAS[proyecto.format];
  const numero = typeof pedidas === "number" ? pedidas : Number.parseInt(String(pedidas), 10);
  if (!Number.isFinite(numero)) throw new ErrorProyecto(400, "Indica cuántas escenas quieres.");
  return numero;
}
