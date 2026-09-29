import { formatoCanta } from "@/lib/direccion";
import { leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { hechosDeEscena, techoDelProyecto } from "../asistente/plan";
import { encolar, filaDeLaConfirmacion, type NuevoTrabajoEncolado } from "../cola/encolar";
import { parametrosDeControles, recopilarHechos } from "../controles/hechos";
import { exigirControles, exigirFrenosDuros } from "../controles/puerta";
import type { FilaEscena, FilaProyecto, FilaTrabajo } from "../db/esquema";
import { decidir } from "../decisiones/reglas";
import { dirigirClipPara } from "../direccion/clip";
import { direccionDeLaEscena } from "../direccion/escena";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirDerechos,
  exigirRevisionDeReferencias,
  exigirRitmo,
  limpiarPrompt,
  limpiarPromptOpcional,
  proveedorDeCredencial,
} from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { exigirSelloVigente } from "../generacion/precios";
import type { Actor } from "../media/servicio";
import { personajePorId, promptConContexto } from "../personajes/contexto";
import { acotarCoste } from "../presupuesto/acotar";
import { eleccionDeCanto } from "./eleccion";
import { ErrorCanto } from "./errores";
import { estadoDelCanto } from "./hechos";

/**
 * **Producción de una escena que canta con un audio propio** (RF06, RF08 y RF10, 0.29.0).
 *
 * Una escena de canto es **un solo trabajo**, como la escena hablada en modo Omni: no hay fotograma que aprobar ni
 * animación que encargar después, porque lo que se anima es el retrato del personaje y lo que se oye es el audio.
 * Por eso se encola como `animacion` sin trabajo padre: lo que produce es el clip de la escena, y el cierre de la
 * cola ya sabe qué hacer con un clip.
 *
 * **Todo el dinero cruza la misma puerta que el resto**: tarifa registrada de esos segundos y esa resolución,
 * confirmación con su sello, idempotencia por confirmación, motor de controles con todos sus grupos de hechos,
 * reserva atómica con el tope de trabajos y el de escenas en vuelo, y cierre con lo que informe el proveedor. Aquí
 * no hay ni una regla de dinero propia; lo único propio es **qué** se envía y **qué se exige antes de enviarlo**.
 *
 * Lo que se exige antes, y lo aplica el motor para que sea lo mismo que ve la pantalla: declaración de derechos
 * vigente de ese audio, duración dentro del tope, retrato válido y vertical, y el consentimiento del personaje, que
 * es la regla de 0.13.0 sin tocar. Si falla cualquiera, **no se reserva ni un crédito**.
 */

/** Lo que el navegador confirma para producir una escena de canto. Es la confirmación de siempre. */
export interface ConfirmacionCanto {
  /** Casilla «tengo derecho a usar esta imagen»: el retrato del personaje se envía al proveedor. */
  derechos: boolean;
  /** Revisión de las referencias del personaje (ADR-0009). */
  sinTerceros: boolean;
  /** Créditos que el usuario tenía delante al confirmar. */
  creditosConfirmados: number;
  /** Sello de la tarifa que se mostró: si ha cambiado, el servidor rechaza el envío. */
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
  /** Este envío repite algo que pudo cobrarse. Lo pone **el servidor**, nunca el navegador. */
  reintentoDeEscena?: boolean;
}

/** La escena y su proyecto, comprobando que la escena es de verdad una escena de canto. */
export async function escenaDeCantoPropia(
  actor: Actor,
  escenaId: unknown,
): Promise<{ escena: FilaEscena; proyecto: FilaProyecto }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (!formatoCanta(escena.clipFormat)) {
    throw new ErrorCanto(
      409,
      "Esta escena no es de canto, así que su clip no se produce así. Cambia su formato a «cantar con tu audio» si quieres que el personaje cante un audio tuyo.",
    );
  }
  return { escena, proyecto };
}

/**
 * Encola el clip cantado. Devuelve el trabajo y si es nuevo: repetir la confirmación (doble clic, reintento tras un
 * error de red) devuelve el que ya existe y **no encarga un segundo clip**.
 */
export async function producirEscenaCantada(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  confirmacion: ConfirmacionCanto,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajo: FilaTrabajo; nueva: boolean }> {
  if (escena.templateId || escena.castFormat !== "solo")
    throw new ErrorCanto(
      409,
      "Esta escena mezcla canto con un trend o un reparto de dos personajes. Quita el trend y vuelve al reparto «solo» antes de confirmar. No se ha cobrado nada.",
    );
  exigirDerechos(confirmacion.derechos);
  exigirRevisionDeReferencias(confirmacion.sinTerceros);
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);

  /**
   * El estado del canto se lee **antes de cualquier cosa que cueste**: de él sale la duración facturada, que es la
   * que decide qué tarifa se lee. Estimar con otra duración y pedir esta sería reservar lo que no se va a cobrar.
   */
  const estado = await estadoDelCanto(actor, escena, proyecto);
  // Las puertas propias del canto se comprueban antes de buscar tarifa o confirmar un gasto. Así, si falta la
  // declaración o el audio supera el tope, la causa no queda tapada por un catálogo todavía sin sincronizar.
  exigirFrenosDuros({ tipo: "animacion", parametros: await parametrosDeControles(), canto: estado.hechos });
  const segundos = estado.audio?.facturados ?? null;
  /**
   * Sin segundos no hay tarifa que leer, así que no se puede ni estimar. El motor lo diría igual —son sus reglas
   * `canto-sin-audio` y `canto-duracion-ilegible`—, pero el motor necesita una elección de modelo para evaluar los
   * hechos del precio, y esa elección es justo lo que aquí no se puede hacer. Se responde con el mismo motivo.
   */
  if (segundos === null) {
    throw new ErrorCanto(
      409,
      estado.audio === null
        ? "Esta escena canta, pero todavía no tiene ningún audio elegido: elige el audio antes de pedir el clip. No se te ha cobrado nada."
        : "No se ha podido medir cuánto dura este audio, y el clip se paga por segundo: sin la duración no se puede calcular el coste ni confirmarlo. Vuelve a subir el audio en un formato corriente (MP3, WAV o M4A). No se te ha cobrado nada.",
    );
  }

  const eleccion = await eleccionDeCanto(segundos);
  const { modelo, adaptador, precio, creditos } = eleccion;
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  // En este formato el precio confirmado es exactamente el del audio por segundo. La traducción de pago de
  // prompts añadiría otra tarifa que la vista de canto no incluye y rompería esa confirmación.
  const totales = creditos;
  exigirConfirmacion(confirmacion.creditosConfirmados, totales);
  await exigirAvisoUmbral(totales, confirmacion.avisoUmbralAceptado);
  // Corte de idempotencia: repetir la misma confirmación devuelve el trabajo que ya existe y no cobra otra vez.
  const repetida = await filaDeLaConfirmacion(actor.id, claveIdempotencia);
  if (repetida) return { trabajo: repetida, nueva: false };
  await exigirRitmo(actor.id);

  const personaje = proyecto.mainCharacterId ? await personajePorId(proyecto.mainCharacterId) : null;
  const hechosEscena = (await hechosDeEscena(actor, escena.id)).hechos;

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
        // También se comprueba la aprobación del plan y de esta escena en la misma puerta que el dinero.
        escena: hechosEscena,
        proyecto: await techoDelProyecto(proyecto.id),
        // Las cinco puertas del canto. Si alguna falla, esto lanza y no se ha reservado nada.
        canto: estado.hechos,
      },
      h.buscar,
    ),
    confirmacion.avisosConfirmados ?? [],
  );

  /**
   * A partir de aquí ya no queda ninguna regla: el motor las ha aplicado todas, y son sus reglas las que
   * garantizan que el audio, su declaración, el retrato y su versión existen. Esta comprobación es el otro lado de
   * esa puerta —lo que convierte «el motor lo ha permitido» en tipos no nulos—, no una segunda regla.
   */
  const audio = estado.audio;
  const retrato = estado.retrato.medio;
  if (!audio || !retrato || !personaje || estado.retrato.versionId === null) {
    throw new ErrorCanto(
      500,
      "No se han podido reunir el audio y el retrato de esta escena justo antes de encolarla. No se ha enviado nada al proveedor y no se te ha cobrado: vuelve a intentarlo.",
    );
  }

  const proveedor = proveedorDeCredencial(modelo);
  /**
   * El texto del clip describe **lo que se ve**, nunca lo que se dice: lo que se oye es el audio subido. El guion
   * de la escena no viaja, y por eso el prompt sale de `action` —la descripción visual— o, si está vacía, del
   * guion, que al menos dice de qué va el plano.
   */
  const prompt = limpiarPrompt(escena.action.trim() !== "" ? escena.action : escena.scriptText);
  const direccion = await direccionDeLaEscena(actor.id, escena, proyecto, {
    // La identidad ya entra por la versión del retrato; no se repite dentro de la dirección.
    descripcion: "",
    real: !personaje.virtual,
    atractivoElegido: personaje.virtual && personaje.beautyOptIn,
    ejesVoz: personaje.voiceAxes,
  });
  const dirigido = dirigirClipPara("generica", {
    ...direccion,
    escena: prompt,
    dialogo: "",
    segundos,
    direccionVocal: "",
    instruccionesExtra: limpiarPromptOpcional(direccion.instruccionesExtraOriginal),
    descripcionExperta: limpiarPromptOpcional(direccion.descripcionExpertaOriginal),
  });
  const contexto = estado.retrato.contexto;
  await exigirDecisionFavorable({
    tipo: "animacion",
    escena: dirigido.escena,
    // Sin diálogo: el modelo no tiene que decir nada, tiene que sincronizarse con el audio.
    dialogo: "",
    contexto,
    conVoz: true,
    conReferencia: true,
    creditos,
  });
  // La instrucción de sincronía del adaptador ya está en inglés. La descripción visual se conserva como la
  // escribió el usuario; este camino no encarga una traducción de pago fuera del coste confirmado.
  const promptFinal = promptConContexto(dirigido.escena, contexto);

  /**
   * La entrada se monta **sin URL**: las del proveedor caducan, así que se vuelve a montar al despachar con el
   * retrato y el audio ya subidos. Lo que se guarda aquí son sus identificadores y la tarifa confirmada.
   */
  const parametros = adaptador.montarEntrada(modelo, {
    escena: promptFinal,
    dialogo: "",
    // El despacho las rellena: aquí solo se comprueba que el modelo sabe montar su entrada con lo que hay.
    urls: ["por-subir"],
    audiosDeReferencia: ["por-subir"],
    segundos,
  });
  const { escenasEnVuelo } = await leerAjustes();
  const valores: NuevoTrabajoEncolado = {
    userId: actor.id,
    kind: "animacion",
    provider: proveedor,
    model: modelo.modelo,
    prompt: promptFinal,
    // El retrato del personaje es la referencia de identidad del clip, igual que en cualquier otra generación suya.
    identityReferenceKind: "vistas",
    input: {
      prompt: promptFinal,
      /**
       * El retrato va por `referencias` y el audio por `audioDeReferencia`: son los dos campos que el despacho ya
       * sabe subir al almacenamiento temporal del proveedor (0.22.0), así que el canto no necesita un camino de
       * subida propio. Las URL no se guardan nunca: caducan y no dicen nada después.
       */
      referencias: [retrato.id],
      audioDeReferencia: audio.medio.id,
      parametros: { ...sinUrls(parametros), segundos },
      // La tarifa confirmada: es la de **estos** segundos y **esta** resolución, y es la que el worker vuelve a
      // comprobar antes de enviar (`despacho.ts › exigirDuracionCobrada`).
      unidadPrecio: precio.unidad,
      escena: dirigido.escena,
      // Lo que convierte este trabajo en un clip cantado para el despacho: es lo que le dice que su capacidad es
      // `audio_to_video` y no `image_to_video`, y por tanto en qué lista buscar su modelo.
      canto: true,
      /** Segundos de audio facturados, tal como se confirmaron. Es lo que explica la cifra en el historial. */
      cantoSegundos: segundos,
      resolucionCanto: eleccion.resolucion,
      ...(contexto === "" ? {} : { contextoPersonaje: contexto }),
    },
    // El origen del clip es el retrato: es lo que el historial enseña como punto de partida.
    sourceMediaId: retrato.id,
    sceneId: escena.id,
    characterId: personaje.id,
    characterVersionId: estado.retrato.versionId,
    referencesReviewedAt: new Date(),
    estimatedCredits: creditos,
  };
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    // Se acota con el coste de **este** clip, que es la tarifa de sus segundos: no hay nada que deducir.
    acotacion: acotarCoste("animacion", eleccion),
    valores,
    sello: precio.sello,
    creditosDelEnvio: totales,
    escena: {
      escenaId: escena.id,
      maximo: escenasEnVuelo,
      reintento: confirmacion.reintentoDeEscena ?? false,
    },
  });
  return { trabajo: fila, nueva };
}

/**
 * La entrada sin los campos por los que viajan las URL del proveedor. Es lo mismo que hace `entradaGuardada` en el
 * servicio de generación, y por el mismo motivo: esas URL caducan y guardarlas sería guardar basura con aspecto de
 * dato. Se quitan por el nombre que declara el adaptador, no por una lista propia.
 */
function sinUrls(parametros: Record<string, unknown>): Record<string, unknown> {
  const { image_url: _imagen, audio_url: _audio, ...resto } = parametros;
  return resto;
}

/** Comprobación previa determinista (contrato de decisiones): un rechazo no llega ni a encolarse. */
async function exigirDecisionFavorable(entrada: Parameters<typeof decidir>[0]): Promise<void> {
  const decision = await decidir(entrada);
  if (decision.estado === "rechazado") throw new ErrorCanto(400, decision.evidencia);
}
