import { creditosDeEscenaOmni, MODELO_OMNI, type VozOmniDelProyecto } from "@/lib/omni";
import { duracionParaModelo } from "@/lib/produccion";
import { firmaDeVoz } from "@/lib/voz";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { techoDelProyecto } from "../asistente/plan";
import { encolar, filaDeLaConfirmacion, type NuevoTrabajoEncolado } from "../cola/encolar";
import { recopilarHechos } from "../controles/hechos";
import { exigirControles } from "../controles/puerta";
import type {
  FilaEscena,
  FilaPersonaje,
  FilaProyecto,
  FilaRegistroOmni,
  FilaTrabajo,
  FilaVersionPersonaje,
} from "../db/esquema";
import { decidir } from "../decisiones/reglas";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirDerechos,
  exigirRevisionDeReferencias,
  exigirRitmo,
  limpiarDialogo,
  limpiarPrompt,
  proveedorDeCredencial,
} from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { exigirSelloVigente } from "../generacion/precios";
import type { Actor } from "../media/servicio";
import { contextoDeVersion, promptConContexto } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { personajePropio } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import { creditosDelEnvio, traducirAlIngles } from "../prompts/traduccion";
import { vozOmniDelProyecto } from "../voz/omni";
import { ErrorOmni } from "./errores";
import { eleccionOmni, registroVigente } from "./registro";

/**
 * Producción de una **escena hablada** en modo `omni` (RF06 y RF08, 0.22.0).
 *
 * Una escena hablada es **un solo trabajo**: no hay fotograma que aprobar ni animación que encargar después,
 * porque la identidad y la voz no vienen de una imagen sino del personaje registrado en el proveedor. Por eso se
 * encola como `animacion` sin trabajo padre: lo que produce es el clip de la escena, y el cierre de la cola ya
 * sabe qué hacer con un clip (`produccion/cierre.ts`).
 *
 * **Todo el dinero cruza la misma puerta que el resto**: estimación con el precio registrado, confirmación con
 * su sello, idempotencia por confirmación, motor de controles con todos sus grupos de hechos, reserva atómica con
 * el tope de trabajos y de escenas en vuelo, y cierre con lo que informe el proveedor. Aquí no hay ni una regla
 * de dinero propia; lo único propio es **qué** se envía.
 */

/** Lo que el navegador confirma para producir una escena hablada. Es la confirmación de siempre. */
export interface ConfirmacionEscenaHablada {
  derechos: boolean;
  sinTerceros: boolean;
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
  /** Este envío repite algo que pudo cobrarse. Lo pone **el servidor** de producción, nunca el navegador. */
  reintentoDeEscena?: boolean;
}

/** Segundos que se le pedirán al modelo: los del proyecto si Omni los admite, y si no, los que admita. */
export const segundosDeEscenaOmni = (duraciones: readonly number[], proyecto: FilaProyecto): number =>
  duracionParaModelo(duraciones, proyecto.clipSeconds);

/**
 * Créditos de una escena hablada con la duración del proyecto. Se calcula en un solo sitio para que la cifra que
 * se muestra, la que se confirma y la que se aparta sean la misma.
 */
export async function creditosDeEscenaHablada(proyecto: FilaProyecto): Promise<{ creditos: number; sello: string }> {
  const { modelo, precio } = await eleccionOmni();
  const segundos = segundosDeEscenaOmni(modelo.parametros.duraciones, proyecto);
  return { creditos: creditosDeEscenaOmni(precio.creditos, segundos), sello: precio.sello };
}

/**
 * Registro con el que se va a producir: el del protagonista, su versión de ficha vigente y la voz del proyecto.
 * Sin él no se produce nada y se dice exactamente qué falta, porque registrar **no cuesta créditos** y por tanto
 * la salida siempre está a un clic.
 */
export async function registroParaProducir(
  actor: Actor,
  proyecto: FilaProyecto,
): Promise<{
  personaje: FilaPersonaje | null;
  version: FilaVersionPersonaje | null;
  registro: FilaRegistroOmni | null;
  voz: VozOmniDelProyecto | null;
  /** Qué falta para poder producir, en llano; vacío cuando no falta nada. Es lo que evalúa el motor. */
  falta: string;
}> {
  const voz = vozOmniDelProyecto(proyecto);
  if (!voz) {
    return {
      personaje: null,
      version: null,
      registro: null,
      voz: null,
      falta: "todavía no tiene ninguna voz registrada: elígela y regístrala en «Voz y subtítulos».",
    };
  }
  if (!proyecto.mainCharacterId) {
    throw new ErrorProyecto(
      409,
      "Este proyecto no tiene protagonista asignado, y en modo Omni la cara de todas las escenas es la suya. Elige un personaje con consentimiento vigente.",
    );
  }
  const personaje = await personajePropio(actor, proyecto.mainCharacterId);
  const version = await ultimaVersion(personaje.id);
  if (!version) {
    return {
      personaje,
      version: null,
      registro: null,
      voz,
      falta: `«${personaje.name}» no tiene todavía ninguna versión de su ficha con la que registrarlo.`,
    };
  }
  const registro = await registroVigente(personaje.id, version.id, voz.audioId);
  return {
    personaje,
    version,
    registro,
    voz,
    falta: registro
      ? ""
      : `«${personaje.name}» no está registrado con la voz de este proyecto (o su ficha ha cambiado desde que se registró).`,
  };
}

/**
 * Hechos de la identidad hablada para el motor de controles. Se leen igual aquí y en la pantalla, así que el
 * panel no puede decir «listo» donde la puerta va a bloquear.
 */
export async function hechosOmni(actor: Actor, proyecto: FilaProyecto) {
  const { falta } = await registroParaProducir(actor, proyecto);
  return { registrado: falta === "", falta };
}

/**
 * Encola la escena hablada. Devuelve el trabajo y si es nuevo: repetir la confirmación (doble clic, reintento tras
 * un error de red) devuelve el que ya existe y **no encarga un segundo clip**.
 */
export async function producirEscenaHablada(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  confirmacion: ConfirmacionEscenaHablada,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajo: FilaTrabajo; nueva: boolean }> {
  const prompt = limpiarPrompt(escena.action.trim() !== "" ? escena.action : escena.scriptText);
  exigirDerechos(confirmacion.derechos);
  exigirRevisionDeReferencias(confirmacion.sinTerceros);
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const eleccion = await eleccionOmni();
  const { modelo, adaptador, precio } = eleccion;
  const segundos = segundosDeEscenaOmni(modelo.parametros.duraciones, proyecto);
  const creditos = creditosDeEscenaOmni(precio.creditos, segundos);
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  const totales = await creditosDelEnvio(creditos);
  exigirConfirmacion(confirmacion.creditosConfirmados, totales);
  await exigirAvisoUmbral(totales, confirmacion.avisoUmbralAceptado);
  const repetida = await filaDeLaConfirmacion(actor.id, claveIdempotencia);
  if (repetida) return { trabajo: repetida, nueva: false };
  await exigirRitmo(actor.id);

  const { personaje, version, registro, voz, falta } = await registroParaProducir(actor, proyecto);

  // ── Punto único: el mismo motor que cierra la puerta de cualquier otro envío ───────────────────────────
  await exigirControles(
    { usuarioId: actor.id, sujeto: "escena", sujetoId: escena.id, tipo: "animacion" },
    await recopilarHechos(
      actor,
      {
        tipo: "animacion",
        eleccion,
        creditos: totales,
        personajeId: personaje?.id ?? null,
        personaje,
        // La aprobación de la escena ya la comprueba `produccion/producir.ts` antes de llegar aquí, igual que en
        // el camino de siempre: el clip no es una segunda decisión de guion.
        escena: null,
        proyecto: await techoDelProyecto(proyecto.id),
        // Sin registro vigente, el motor bloquea con su motivo: es la regla `omni-sin-registro`.
        omni: { registrado: falta === "", falta },
      },
      h.buscar,
    ),
    confirmacion.avisosConfirmados ?? [],
  );

  /**
   * A partir de aquí ya no queda ninguna regla: el motor las ha aplicado todas, y la de `omni-sin-registro` es la
   * que garantiza que estos tres existen. La comprobación es el otro lado de esa puerta, no una segunda regla.
   */
  if (!personaje || !version || !registro || !voz) {
    throw new ErrorOmni(409, `Este proyecto no puede producir escenas habladas todavía: ${falta}`);
  }
  const proveedor = proveedorDeCredencial(modelo);
  // Lo que dice el personaje sale **en español y sin traducir**: es lo que se va a oír. La descripción de lo que
  // se ve sí se traduce, como en todos los demás modelos (decisión firme del propietario, 2026-09-27).
  const dialogo = limpiarDialogo(escena.scriptText);
  const contexto = contextoDeVersion(version, personaje.kind);
  await exigirDecisionFavorable({
    tipo: "animacion",
    escena: prompt,
    dialogo,
    contexto,
    conVoz: true,
    conReferencia: true,
    creditos,
  });
  const enIngles = await traducirAlIngles(
    actor.id,
    [{ texto: prompt }, { texto: contexto, personajeId: personaje.id }],
    h.buscar,
  );
  const escenaEnIngles = enIngles.get(prompt) ?? prompt;
  const contextoEnIngles = enIngles.get(contexto) ?? contexto;
  const promptFinal = promptConContexto(escenaEnIngles, contextoEnIngles);
  const parametros = adaptador.montarEntrada(modelo, {
    escena: promptFinal,
    dialogo,
    urls: [],
    segundos,
    personajesOmni: [registro.remoteCharacterId],
  });

  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "animacion",
    provider: proveedor,
    model: modelo.modelo,
    prompt: promptFinal,
    input: {
      prompt: promptFinal,
      // Sin referencias: la cara la pone el registro del proveedor, no una foto que se suba en cada escena.
      referencias: [],
      parametros: { ...parametros, segundos },
      dialogo,
      escena: prompt,
      ...(contextoEnIngles === "" ? {} : { contextoPersonaje: contextoEnIngles }),
      /**
       * Identidad registrada con la que se encoló. El worker envía **esta** y no la que el personaje tenga
       * registrada al llegar su turno: lo que se paga tiene que ser lo que el usuario confirmó.
       */
      personajesOmni: [registro.remoteCharacterId],
      /** Firma de la voz con la que sale, para poder decir después si lo generado sigue correspondiendo. */
      firmaVoz: firmaDeVoz("omni", null, escena.scriptText, {
        audioId: voz.audioId,
        personajeOmniId: registro.remoteCharacterId,
      }),
    },
    sourceMediaId: null,
    sceneId: escena.id,
    characterId: personaje.id,
    characterVersionId: version.id,
    referencesReviewedAt: new Date(),
    estimatedCredits: creditos,
  };
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    // Se acota con el coste de **esta** escena, que escala con su duración, no con el precio de referencia.
    acotacion: acotarCoste("animacion", { ...eleccion, precio: { ...precio, creditos } }),
    valores,
    sello: precio.sello,
    creditosDelEnvio: totales,
    escena: await topeDeEscenas(escena.id, confirmacion.reintentoDeEscena ?? false),
  });
  return { trabajo: fila, nueva };
}

/** Comprobación previa determinista (contrato de decisiones): un rechazo no llega ni a encolarse. */
async function exigirDecisionFavorable(entrada: Parameters<typeof decidir>[0]): Promise<void> {
  const decision = await decidir(entrada);
  if (decision.estado === "rechazado") throw new ErrorOmni(400, decision.evidencia);
}

/** Tope de escenas en vuelo del usuario, igual que en cualquier otra producción. */
async function topeDeEscenas(escenaId: string, reintento: boolean) {
  const { leerAjustes } = await import("../ajustes");
  const { escenasEnVuelo } = await leerAjustes();
  return { escenaId, maximo: escenasEnVuelo, reintento };
}

/** La escena y su proyecto, comprobando que el proyecto está de verdad en modo `omni`. */
export async function escenaHabladaPropia(
  actor: Actor,
  escenaId: unknown,
): Promise<{ escena: FilaEscena; proyecto: FilaProyecto }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (proyecto.voiceMode !== "omni") {
    throw new ErrorOmni(409, "Este proyecto no está en modo Omni, así que sus escenas no se producen así.");
  }
  return { escena, proyecto };
}

/** Nombre del modelo con el que se producen las escenas habladas. Se enseña en la pantalla y en los errores. */
export const MODELO_DE_ESCENA_HABLADA = MODELO_OMNI;
