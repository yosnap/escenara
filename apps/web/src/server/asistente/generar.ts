import { eq } from "drizzle-orm";
import { ErrorPropuesta, INSTRUCCIONES_ASISTENTE, leerPropuesta, peticionDeGuion } from "@/lib/asistente";
import { esProveedor } from "@/lib/boveda";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { CONCEPTO_MAXIMO, ESCENAS_SUGERIDAS, type ProyectoDetalle } from "@/lib/proyectos";
import { motivoSinDeclaracion } from "../anuncio/puerta-guion";
import { db } from "../db/cliente";
import { assistantRuns, type FilaProyecto, projects } from "../db/esquema";
import {
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirCredencial,
  exigirSaldo,
} from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorDeTexto, ErrorPeticionRepetida, pedirTextoPorMapa, type TextoDelMapa } from "../mapa/texto";
import type { Actor } from "../media/servicio";
import { filaPropia } from "../personajes/consulta";
import { contextoDeVersion } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { exigirPersonajeUsable } from "../personajes/puede-generar";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";
import { proyectoPropio } from "./consulta";
import { ErrorProyecto } from "./errores";
import { sustituirEscenas } from "./escenas";
import { ejecucionDeLaConfirmacion } from "./gasto";
import { detalleProyecto, exigirTopeDelProyecto } from "./plan";
import { exigirAsistenteDisponible } from "./texto";

/**
 * El asistente de guion: de una idea a un concepto y un guion por escenas (RF05).
 *
 * **Es el único camino de esta versión que gasta dinero**, así que lo recorre entero, en este orden:
 *
 * 1. proyecto del usuario, con idea escrita;
 * 2. asistente disponible (encendido, con modelo de texto utilizable y con la clave del usuario);
 * 3. **estimación confirmada**: los créditos que el usuario tenía delante y el sello del precio vigente. Si el
 *    precio cambió entre la pantalla y el botón, se rechaza y se vuelve a mostrar;
 * 4. **clave de idempotencia**: la misma confirmación nunca se cobra dos veces;
 * 5. **límite de ritmo** por usuario;
 * 6. **reserva** del coste estimado en el `usage_ledger`, antes de llamar a nadie;
 * 7. la llamada, con la clave del propio usuario;
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
  const eleccion = await exigirAsistenteDisponible(actor.id);
  const { modelo, adaptador, precio } = eleccion;
  const generarTexto = adaptador.generarTexto;
  if (!generarTexto) throw new ErrorProyecto(503, `El adaptador de ${modelo.nombreProveedor} no sabe pedir texto.`);
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  exigirSelloVigente(peticion.selloEstimacion, precio.sello, true);
  // Una confirmación repetida (doble clic, reintento tras un error de red) **no gasta ritmo**: se responde con lo
  // que ya hay. Si no, reintentar un fallo de red podría dejar al usuario sin poder pedir nada durante una hora.
  const yaEjecutada = await ejecucionDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaEjecutada) return detalleProyecto(actor, proyecto.id);
  if (!(await dentroDelLimite(`asistente:${actor.id}`, RITMO_ASISTENTE))) {
    throw new ErrorProyecto(429, "Has pedido demasiados guiones seguidos. Espera un rato.");
  }
  // `estadoDelAsistente` ya lo ha comprobado; aquí se vuelve a acotar porque es lo que decide con qué clave
  // se paga, y eso no se deduce de un `as`.
  if (!esProveedor(modelo.proveedor)) {
    throw new ErrorProyecto(503, `Esta instalación aún no puede pagar texto en ${modelo.nombreProveedor}.`);
  }
  const proveedor = modelo.proveedor;
  const clave = await exigirCredencial(actor.id, proveedor);
  // Si se conoce el saldo del usuario en el proveedor y no llega, no se llama: el proveedor lo rechazaría y la
  // reserva se habría apartado para nada.
  await exigirSaldo(actor.id, creditos, buscar, proveedor);

  // La petición se compone **antes** de reservar: leer la ficha del protagonista puede fallar (consentimiento
  // revocado, personaje borrado), y una reserva apartada por un fallo nuestro le comería presupuesto al usuario
  // hasta que el barrido la cerrara.
  const entrada = peticionDeGuion({
    idea: proyecto.idea,
    formato: proyecto.format,
    contextoPersonaje: await contextoDelProtagonista(actor, proyecto),
    escenas: numeroDeEscenas(peticion.escenas, proyecto),
    segundos: proyecto.clipSeconds,
  });

  // El presupuesto autorizado del proyecto es un **tope que se aplica al gastar**: lo que ya lleva comprometido
  // más esta llamada tiene que caber (decisión provisional del propietario, 2026-09-27).
  await exigirTopeDelProyecto(actor.id, proyecto.id, creditos);

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
    const propuesta = leerPropuesta(resultado.texto, proyecto.clipSeconds);
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
        `${resultado.nombreProveedor} (${resultado.modelo}) ha contestado, pero su texto no se pudo usar como guion: ${error.message}`,
      );
    }
    throw error;
  }
  return detalleProyecto(actor, proyecto.id);
}

function numeroDeEscenas(pedidas: unknown, proyecto: FilaProyecto): number {
  if (pedidas === undefined || pedidas === null || pedidas === "") return ESCENAS_SUGERIDAS[proyecto.format];
  const numero = typeof pedidas === "number" ? pedidas : Number.parseInt(String(pedidas), 10);
  if (!Number.isFinite(numero)) throw new ErrorProyecto(400, "Indica cuántas escenas quieres.");
  return numero;
}
