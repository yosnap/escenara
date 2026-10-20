import { eq } from "drizzle-orm";
import { CAPACIDAD_DE_TIPO, duracionesConCoste, type ModeloVista, segundosDeUnidad } from "@/lib/catalogo";
import { bloqueDeContinuidad, conContinuidad, esPlanoBase, leerBibliaContinuidad } from "@/lib/continuidad";
import { proporcionFijadaDelProyecto } from "@/lib/formatos";
import type { Medio } from "@/lib/media/tipos";
import {
  creditosDeEscenaOmni,
  faltaDeVoz,
  type HablanteConVoz,
  motivoSinReparto,
  precioOmniEstimado,
  usaIdentidadRegistrada,
  type VozOmniDelProyecto,
} from "@/lib/omni";
import { duracionParaModelo } from "@/lib/produccion";
import { exigeDeclaracionDeMarca } from "@/lib/productos";
import { firmaDeVoz, nombreDeVoz } from "@/lib/voz";
import { contextoAnimadoDeEscena } from "../animados/contexto-escena";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { techoDelProyecto } from "../asistente/plan";
import { retirarPlanosCaducados } from "../automatico/huella-plano";
import { encolar, filaDeLaConfirmacion, type NuevoTrabajoEncolado } from "../cola/encolar";
import { hechosDelReparto, recopilarHechos } from "../controles/hechos";
import { exigirControles } from "../controles/puerta";
import { db } from "../db/cliente";
import {
  type FilaEscena,
  type FilaPersonaje,
  type FilaProyecto,
  type FilaRegistroOmni,
  type FilaTrabajo,
  type FilaVersionPersonaje,
  scenes,
} from "../db/esquema";
import { decidir } from "../decisiones/reglas";
import { dirigirClipPara, familiaDe } from "../direccion/clip";
import { direccionDeLaEscena } from "../direccion/escena";
import { conHojaDeIdentidad } from "../direccion/hoja-identidad";
import {
  claveDerivada,
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirDerechoDeMarca,
  exigirDerechos,
  exigirRevisionDeReferencias,
  exigirRitmo,
  limpiarDialogo,
  limpiarPrompt,
  proveedorDeCredencial,
} from "../generacion/comprobaciones";
import { proporcionDelEnvio } from "../generacion/formato-del-envio";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { type EleccionDeTrabajo, exigirSelloVigente } from "../generacion/precios";
import { conLugarSuelto, lugarDelEnvio, lugarDelPrompt, textosDelLugar } from "../lugares/en-el-envio";
import { columnasDelLugar } from "../lugares/para-generar";
import type { Actor } from "../media/servicio";
import { contextoDeVersion, promptConContexto } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { personajePropio, referenciasParaGenerar } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import { fechaDeLaDeclaracionDeMarca, marcaAlEnviar } from "../productos/declaracion-marca";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { productoEnPrompt, productoParaGenerar } from "../productos/prompt";
import { referenciasDelPersonajeQueViajan } from "../productos/referencias";
import { hojaEnElEnvio, repartoCompletoDelEnvio } from "../productos/reparto-del-envio";
import { creditosDelEnvio, traducirAlIngles } from "../prompts/traduccion";
import { miembrosDelReparto, otrosDeLaConversacion } from "../reparto/consulta";
import { exigirFormatoActivo } from "../reparto/servicio";
import { muestrasDe } from "../voz/muestra";
import { vozOmniDelProyecto, vozRegistradaDe } from "../voz/omni";
import { vozDelProyecto } from "../voz/proyecto";
import { ErrorOmni } from "./errores";
import { eleccionOmni, registroVigente } from "./registro";
import {
  type ClipDelReparto,
  clipsEsperadosDe,
  enviosDelReparto,
  faltasDeRegistroDelReparto,
  personajeDelPlano,
} from "./reparto";

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
  /** Casilla «tengo derecho a usar esta marca» (0.26.0). Obligatoria en cuanto la escena lleva producto. */
  derechoMarca?: boolean;
  sinTerceros: boolean;
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
  /** Este envío repite algo que pudo cobrarse. Lo pone **el servidor** de producción, nunca el navegador. */
  reintentoDeEscena?: boolean;
}

/**
 * Segundos que se le pedirán al modelo: los pedidos (los de la escena, o los del proyecto si no se dice) si Omni los
 * admite, y si no, los que admita.
 */
export const segundosDeEscenaOmni = (
  duraciones: readonly number[],
  proyecto: FilaProyecto,
  segundosPedidos: number = proyecto.clipSeconds,
): number => duracionParaModelo(duraciones, segundosPedidos);

/**
 * Segundos planificados de una escena hablada. Cada escena guarda los suyos: en un vídeo completo un podcast de 20 s
 * son clips de 8, 6 y 6 s. Las demás escenas copian los del proyecto, así que para ellas no cambia nada.
 */
export const segundosPlanificados = (escena: Pick<FilaEscena, "plannedSeconds">, proyecto: FilaProyecto): number =>
  escena.plannedSeconds > 0 ? escena.plannedSeconds : proyecto.clipSeconds;

/**
 * Créditos de una escena hablada a partir de la tarifa leída. Si la tarifa **es** la de esa duración («clip de
 * 6 s»), se cobra tal cual: volver a escalarla sería cobrarla dos veces. Solo cuando no hay tarifa propia de esa
 * duración se estima en proporción, y desde los segundos de la tarifa que sí se leyó.
 */
export function creditosDeTarifa(
  precio: { unidad: string; creditos: number },
  segundos: number,
  modelo: string,
): number {
  const segundosDeTarifa = segundosDeUnidad(precio.unidad);
  if (segundosDeTarifa === segundos) return Math.ceil(precio.creditos);
  if (segundosDeTarifa !== null && segundos > 0) {
    return Math.max(Math.ceil(precio.creditos), Math.ceil((precio.creditos * segundos) / segundosDeTarifa));
  }
  return creditosDeEscenaOmni(precio.creditos, segundos, modelo);
}

/** Modelo, duración y tarifa de **un** clip hablado con la duración pedida (la del proyecto si no se dice). */
async function tarifaDeEscenaHablada(
  usuarioId: string,
  proyecto: FilaProyecto,
  segundosPedidos: number,
): Promise<{ eleccion: EleccionDeTrabajo; segundos: number; creditos: number }> {
  /**
   * Se lee **dos veces a propósito**: primero para saber qué modelo sería y qué duración admite, y después con
   * esa duración para leer **su** tarifa. Desde la 0.23.4 cada duración de Gemini Omni tiene su precio publicado
   * (63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s), así que la escena se cobra por la tarifa de su duración en
   * lugar de escalar la de 4 s. Solo se escala lo que no tenga tarifa propia, y se dice que es estimado.
   */
  const { modelo: primero } = await eleccionOmni(usuarioId, undefined, proyecto);
  const segundos = segundosDeEscenaOmni(duracionesDeOmni(primero), proyecto, segundosPedidos);
  const eleccion = await eleccionOmni(usuarioId, segundos, proyecto);
  return { eleccion, segundos, creditos: creditosDeTarifa(eleccion.precio, segundos, eleccion.modelo.modelo) };
}

/** Lo que cuesta una escena hablada, con el modelo y la duración que de verdad se le van a pedir al proveedor. */
export interface CosteDeEscenaOmni {
  eleccion: EleccionDeTrabajo;
  segundos: number;
  /** Tarifa de un clip. */
  creditosPorClip: number;
  /** El primer clip lleva además la traducción del texto de la escena, que se hace y se paga una sola vez. */
  creditosDelPrimerClip: number;
  /** La tarifa de esa duración es una estimación en proporción y no un precio registrado. */
  precioEstimado: boolean;
}

/**
 * **La cuenta única del coste de una escena hablada**: la usan la confirmación del gasto, la estimación del reparto
 * y el plan del proyecto (con el editor y la producción, que leen lo que el plan congela). Si cada pantalla hiciera
 * la suya, el plan diría una cifra y el servidor exigiría otra.
 */
export async function costeDeEscenaOmni(
  usuarioId: string,
  proyecto: FilaProyecto,
  /** Segundos de la escena; sin ellos, los del proyecto (los resúmenes de pantalla que no son de una escena). */
  segundosPedidos: number = proyecto.clipSeconds,
): Promise<CosteDeEscenaOmni> {
  const { eleccion, segundos, creditos } = await tarifaDeEscenaHablada(usuarioId, proyecto, segundosPedidos);
  return {
    eleccion,
    segundos,
    creditosPorClip: creditos,
    creditosDelPrimerClip: await creditosDelEnvio(creditos),
    precioEstimado: precioDeDuracionEstimado(eleccion.modelo, segundos),
  };
}

/** Total que se confirma por una escena de `clips` clips: el primero, con su traducción, y la tarifa de cada uno más. */
export const totalDeEscenaOmni = (coste: CosteDeEscenaOmni, clips: number): number =>
  coste.creditosDelPrimerClip + coste.creditosPorClip * Math.max(0, clips - 1);

/**
 * Prompt de un envío hablado. Con reparto (podcast o dualcast) **no viaja la ficha del protagonista**: cada cara
 * la pone su `character_id`, registrado con su propia descripción, y pegar la de uno solo («mantén la identidad
 * de la misma persona de las fotos», sin fotos) le describiría al modelo a una sola mujer para dos caras, o la del
 * protagonista en el clip del otro.
 */
export const promptDelEnvio = (escenaDirigida: string, contextoDelProtagonista: string, conReparto: boolean): string =>
  conReparto ? escenaDirigida : promptConContexto(escenaDirigida, contextoDelProtagonista);

/**
 * `true` cuando el precio de esa duración es una **estimación en proporción** y no una tarifa registrada. Desde
 * la 0.23.4 casi nunca lo es: el proveedor publica el precio de cada duración de Gemini Omni, así que lo que se
 * enseña es su tarifa. Se sigue diciendo cuando no la hay, porque un precio deducido no es un precio medido.
 */
export const precioDeDuracionEstimado = (modelo: ModeloVista, segundos: number): boolean =>
  !duracionesConCoste(modelo).some((d) => d.segundos === segundos) && precioOmniEstimado(segundos, modelo.modelo);

/** Duraciones que el modelo admite **y sabe cobrar**: las demás no se pueden confirmar, así que no se piden. */
export const duracionesDeOmni = (modelo: ModeloVista): number[] => {
  const cobrables = duracionesConCoste(modelo).map((d) => d.segundos);
  return cobrables.length > 0 ? cobrables : modelo.parametros.duraciones;
};

/**
 * Registro con el que se va a producir: el del protagonista (o el del personaje del plano), su versión de ficha
 * vigente y **su voz**: la propia si la tiene y, si no, la del proyecto. Sin él no se produce nada y se dice
 * exactamente qué falta, porque registrar **no cuesta créditos** y por tanto la salida siempre está a un clic.
 */
export async function registroParaProducir(
  actor: Actor,
  proyecto: FilaProyecto,
  /** Modelo con el que se va a producir; sin él se mira el que elegiría el mapa ahora mismo. */
  modelo?: string,
  /**
   * La conversación en la que habla, si es un plano de podcast: quién es el protagonista de verdad del proyecto y
   * quién sale en los otros planos. Es con quien no puede compartir voz.
   */
  conversacion?: { protagonistaId: string | null; otros: readonly HablanteConVoz[] },
): Promise<{
  personaje: FilaPersonaje | null;
  version: FilaVersionPersonaje | null;
  registro: FilaRegistroOmni | null;
  voz: VozOmniDelProyecto | null;
  /**
   * Muestra ya pagada de la voz del proyecto, que es el audio de referencia de los motores que no registran
   * identidades (MiniMax H3). `null` con los de identidad registrada, que no la necesitan.
   */
  muestra?: Medio | null;
  /** Qué falta para poder producir, en llano; vacío cuando no falta nada. Es lo que evalúa el motor. */
  falta: string;
}> {
  /**
   * Los dos motores de escenas habladas no necesitan lo mismo (0.22.0):
   *
   * - los de **identidad registrada** (Gemini Omni) necesitan la voz y el personaje registrados en el proveedor;
   * - los de **referencias** (MiniMax H3) no registran nada: necesitan la voz del proyecto —la del mapa de voz,
   *   la misma del modo `pista`— y su **muestra ya pagada**, que es lo que viaja como audio de referencia.
   */
  const conRegistro = usaIdentidadRegistrada(modelo ?? (await modeloDeEscenaHablada(actor.id, proyecto)));
  if (!conRegistro) return referenciasParaProducir(actor, proyecto);
  const vacio = { personaje: null, version: null, registro: null, voz: null };
  if (!proyecto.mainCharacterId) {
    if (!vozOmniDelProyecto(proyecto)) {
      return {
        ...vacio,
        falta: "todavía no tiene ninguna voz registrada: elígela y regístrala en «Voz y subtítulos».",
      };
    }
    throw new ErrorProyecto(
      409,
      "Este proyecto no tiene protagonista asignado, y en modo «Voz e identidad registradas» la cara de todas las escenas es la suya. Elige un personaje con consentimiento vigente.",
    );
  }
  const personaje = await personajePropio(actor, proyecto.mainCharacterId);
  const voz = vozRegistradaDe(personaje, proyecto);
  if (!voz) {
    return {
      ...vacio,
      falta:
        conversacion && conversacion.protagonistaId !== personaje.id
          ? `«${personaje.name}» no tiene ninguna voz registrada: elige y registra su voz en su ficha. No cuesta créditos.`
          : "todavía no tiene ninguna voz registrada: elígela y regístrala en «Voz y subtítulos».",
    };
  }
  const deVoz = conversacion
    ? faltaDeVoz(
        { personajeId: personaje.id, nombre: personaje.name, audioIdPropio: personaje.omniAudioId },
        conversacion.otros,
        proyecto.omniAudioId,
        conversacion.protagonistaId,
      )
    : "";
  if (deVoz !== "") return { ...vacio, personaje, voz, falta: `«${personaje.name}» ${deVoz}` };
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
      : `«${personaje.name}» no está registrado con ${personaje.omniAudioId === "" ? "la voz de este proyecto" : "su voz"} (o su ficha ha cambiado desde que se registró).`,
  };
}

/**
 * La conversación de un plano de podcast: el protagonista de verdad y quién sale en los demás planos de su grupo.
 * `undefined` fuera de un plano de podcast, donde no hay con quién comparar la voz.
 */
export async function conversacionDelPlano(
  escena: FilaEscena,
  proyecto: FilaProyecto,
  personajeId: string | null,
): Promise<{ protagonistaId: string | null; otros: HablanteConVoz[] } | undefined> {
  if (!personajeId || escena.podcastGroupId === null) return undefined;
  return { protagonistaId: proyecto.mainCharacterId, otros: await otrosDeLaConversacion(escena, personajeId) };
}

/** Modelo con el que se produciría ahora mismo una escena hablada; vacío si no hay ninguno utilizable. */
async function modeloDeEscenaHablada(usuarioId: string, proyecto: FilaProyecto): Promise<string> {
  try {
    return (await eleccionOmni(usuarioId, undefined, proyecto)).modelo.modelo;
  } catch {
    return "";
  }
}

/**
 * Lo que hace falta con un motor **de referencias** (MiniMax H3): la voz del proyecto fijada en su mapa de voz y
 * su **muestra ya pagada**, que es el audio que se le manda en cada clip para que suene con ese timbre.
 *
 * La muestra no se paga aquí: se paga una sola vez desde el selector de voz, y esta pantalla dice que falta. Así
 * el gasto sigue estando donde el usuario lo confirma, y no escondido dentro de producir una escena.
 */
async function referenciasParaProducir(actor: Actor, proyecto: FilaProyecto) {
  const vacio = { personaje: null, version: null, registro: null, voz: null };
  const voz = vozDelProyecto(proyecto);
  if (!voz) {
    return {
      ...vacio,
      falta:
        "todavía no tiene voz elegida. Este motor pone la voz con una muestra de la tuya, así que elígela en «Voz y subtítulos».",
    };
  }
  if (!proyecto.mainCharacterId) {
    throw new ErrorProyecto(
      409,
      "Este proyecto no tiene protagonista asignado, y en las escenas habladas la cara de todas es la suya. Elige un personaje con consentimiento vigente.",
    );
  }
  const personaje = await personajePropio(actor, proyecto.mainCharacterId);
  const version = await ultimaVersion(personaje.id);
  const muestra = (await muestrasDe(actor, voz.modelo, voz.parametros)).get(voz.voz) ?? null;
  return {
    personaje,
    version,
    registro: null,
    voz: null,
    muestra,
    falta: muestra
      ? ""
      : `la voz «${nombreDeVoz(voz.voz)}» de este proyecto todavía no tiene muestra pagada, y este motor la necesita como referencia para que el clip suene con ese timbre. Óyela una vez desde «Voz y subtítulos»: se paga una sola vez y se reutiliza en todas las escenas.`,
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
 * Encola la escena hablada. Devuelve los trabajos encolados y cuántos son nuevos: repetir la confirmación (doble
 * clic, reintento tras un error de red) devuelve los que ya existen y **no encarga ni un clip más**.
 *
 * **Un podcast son dos clips y una sola confirmación** (0.28.0): se estima la suma de los dos, se confirma
 * exactamente esa suma y se encola cada uno con su propia clave derivada y su propia reserva. Que sean dos
 * reservas es lo que hace que cancelar uno no cobre el otro y que un fallo de uno no tire el otro.
 */
export async function producirEscenaHablada(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  confirmacion: ConfirmacionEscenaHablada,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajos: FilaTrabajo[]; nuevas: number; fallo: string | null }> {
  if (escena.placeShot === "solo_lugar") {
    throw new ErrorOmni(
      409,
      "El plano del lugar solo se produce como fotograma y clip mudo, y en modo «Voz e identidad registradas» cada escena es un clip hablado. Cambia el modo de voz del proyecto o haz el plano en otro proyecto y móntalo. No se ha cobrado nada.",
    );
  }
  const prompt = limpiarPrompt(escena.action.trim() !== "" ? escena.action : escena.scriptText);
  if (escena.castFormat !== "solo") {
    await exigirFormatoActivo(escena.castFormat);
    const miembros = await miembrosDelReparto(escena.id);
    if (miembros.length !== 2) {
      throw new ErrorOmni(
        409,
        "El reparto necesita exactamente dos personajes propios antes de generar. Añade el segundo en la escena.",
      );
    }
    if (escena.productId !== null) {
      throw new ErrorOmni(
        409,
        "Quita el producto de esta escena antes de generar: sus fotos no pueden viajar junto con las dos identidades registradas.",
      );
    }
  }
  exigirDerechos(confirmacion.derechos);
  exigirRevisionDeReferencias(confirmacion.sinTerceros);
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  // Con la duración **de esta escena**: la confirmación, la reserva y lo que se pide al proveedor son de su clip.
  const coste = await costeDeEscenaOmni(actor.id, proyecto, segundosPlanificados(escena, proyecto));
  const { eleccion, segundos, creditosPorClip: creditos, creditosDelPrimerClip: porClip } = coste;
  const { modelo, adaptador, precio } = eleccion;
  const sinReparto = escena.castFormat === "solo" ? null : motivoSinReparto(modelo);
  if (sinReparto) throw new ErrorOmni(409, `${sinReparto} No se ha cobrado nada.`);
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  /**
   * **El coste se confirma una vez y por el total** (0.28.0). Cada clip cuesta lo mismo —la misma tarifa y la
   * misma duración—, y la traducción del texto de la escena se paga una sola vez porque se hace una sola vez. Así
   * que el total es el de un envío más lo que cuesta cada clip de más. Confirmar el coste de **un** clip cuando
   * son dos se rechaza aquí: es exactamente lo que `exigirConfirmacion` existe para impedir.
   */
  const clipsEsperados = await clipsEsperadosDe(escena);
  const totales = totalDeEscenaOmni(coste, clipsEsperados);
  exigirConfirmacion(confirmacion.creditosConfirmados, totales);
  await exigirAvisoUmbral(totales, confirmacion.avisoUmbralAceptado);
  /**
   * Clave propia de cada clip, derivada de la que firmó el navegador. Con un solo clip **es** la del navegador,
   * así que una escena de siempre se comporta exactamente igual que antes de esta versión.
   */
  const claveDelClip = (orden: number) =>
    clipsEsperados === 1 ? claveIdempotencia : claveDerivada(claveIdempotencia, "clip-reparto", String(orden));
  const yaEncoladas = (
    await Promise.all(
      Array.from({ length: clipsEsperados }, (_, i) => filaDeLaConfirmacion(actor.id, claveDelClip(i + 1))),
    )
  ).filter((fila): fila is FilaTrabajo => fila !== null);
  if (yaEncoladas.length === clipsEsperados) return { trabajos: yaEncoladas, nuevas: 0, fallo: null };
  await exigirRitmo(actor.id);

  const conIdentidad = usaIdentidadRegistrada(modelo.modelo);
  /**
   * El plano de un podcast escrito como plano y contraplano es una escena de **un** personaje que puede no ser el
   * protagonista: sale quien está en su reparto. Fuera de ese caso, el de siempre: el protagonista del proyecto.
   */
  const delPlano = await personajeDelPlano(escena);
  const proyectoDelEnvio = delPlano ? { ...proyecto, mainCharacterId: delPlano } : proyecto;
  const { personaje, version, registro, voz, falta, muestra } = await registroParaProducir(
    actor,
    proyectoDelEnvio,
    modelo.modelo,
    await conversacionDelPlano(escena, proyecto, delPlano),
  );
  // También el camino Omni debe cerrar la mezcla de acabados antes de reservar presupuesto.
  await contextoAnimadoDeEscena(escena.id, personaje);

  /**
   * **El producto de la escena** (0.26.0) y lo que cuesta llevarlo en modo Omni.
   *
   * `character_ids` y las imágenes de referencia son excluyentes en este modelo, así que una escena con
   * producto **renuncia a la identidad registrada**: la cara sale de las fotos del personaje y la voz deja de
   * ser la registrada, con lo que puede variar entre escenas. Es una decisión del usuario y por eso se avisa
   * antes de cobrar (`producto-sin-identidad-registrada`) con la alternativa de hacer el producto en un plano
   * aparte y montarlo.
   */
  const producto = await productoParaGenerar(actor.id, escena.productId, escena.productAction, undefined, {
    ids: escena.productPhotoIds,
    estricta: false,
  });
  // Lo que de verdad se va a enviar: con producto no se cita la identidad registrada aunque el motor la tenga.
  const citaIdentidad = conIdentidad && producto === null;
  /**
   * Sin la identidad registrada, la voz tiene que ir como muestra de audio, igual que en el motor de referencias.
   * El registro no la carga, así que se lee aquí: sin ella el clip saldría con una voz inventada y se cobraría.
   */
  const sinRegistro = conIdentidad && !citaIdentidad ? await referenciasParaProducir(actor, proyectoDelEnvio) : null;
  const muestraEnviada = sinRegistro ? (sinRegistro.muestra ?? null) : muestra;
  const faltaEnviada = sinRegistro?.falta || falta;
  /**
   * **El lugar de la escena**. En la escena hablada no se genera fotograma, así que el sitio viaja **descrito**: la
   * cara idéntica la da la identidad registrada, y el set lo fija la descripción de la versión. Se resuelve una vez
   * para toda la escena, así que los dos clips de un podcast llevan el mismo lugar y la misma versión.
   */
  const conLugar = await lugarDelEnvio(actor.id, escena, null, null);
  const { conProducto, hechosLugar } = await repartoCompletoDelEnvio({
    producto,
    conLugar,
    adaptador,
    modelo,
    identidadRegistradaPerdida: conIdentidad,
    envio: { tipo: "escena-omni", personaje, conHoja: personaje !== null && hojaEnElEnvio(personaje, escena.id) },
  });
  // Con marca o sin responder se exige; solo un «no» explícito deja sin nada que autorizar.
  if (producto && exigeDeclaracionDeMarca(producto.marcaVisible)) exigirDerechoDeMarca(confirmacion.derechoMarca);
  if (conProducto) await completarModelosSugeridos(conProducto.hechos, CAPACIDAD_DE_TIPO.animacion);

  /**
   * El reparto de la escena (0.28.0): en una escena hablada con dos personajes, **cada persona real** necesita su
   * consentimiento, cada uno necesita **su registro en el proveedor** y el diálogo tiene que caber en el clip. Los
   * tres se evalúan en el motor, antes de tocar un crédito, y el motivo nombra a quién le falta qué.
   */
  const conReparto = await hechosDelReparto(escena, {
    segundosPorClip: segundos,
    sinRegistrar: citaIdentidad ? await faltasDeRegistroDelReparto(escena, proyecto) : [],
  });

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
        ...(conReparto ? { reparto: conReparto } : {}),
        ...(conProducto ? { producto: conProducto.hechos } : {}),
        ...hechosLugar,
      },
      h.buscar,
    ),
    confirmacion.avisosConfirmados ?? [],
  );

  /**
   * A partir de aquí ya no queda ninguna regla: el motor las ha aplicado todas, y la de `omni-sin-registro` es la
   * que garantiza que estos tres existen. La comprobación es el otro lado de esa puerta, no una segunda regla.
   */
  if (!personaje || !version || (citaIdentidad && (!registro || !voz)) || (!citaIdentidad && !muestraEnviada)) {
    throw new ErrorOmni(409, `Este proyecto no puede producir escenas habladas todavía: ${faltaEnviada}`);
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
  // El matiz de voz se traduce con el resto del texto libre; el diálogo no, que es lo que se va a oír.
  const matizDeVoz = escena.dialogueDirection.trim();
  // Igual que el matiz de voz: las instrucciones adicionales y la descripción del modo experto las escribe el
  // usuario en castellano y el prompt va en inglés.
  const instrucciones = escena.extraInstructions.trim();
  const descripcionExperta = escena.expertDescription.trim();
  const enIngles = await traducirAlIngles(
    actor.id,
    [
      { texto: prompt },
      { texto: contexto, personajeId: personaje.id },
      { texto: matizDeVoz },
      { texto: instrucciones },
      { texto: descripcionExperta },
      { texto: producto?.descripcionOriginal ?? "" },
      ...textosDelLugar(conLugar),
    ],
    h.buscar,
  );
  const enInglesO = (texto: string) => (texto === "" ? "" : (enIngles.get(texto) ?? texto));
  /**
   * **Continuidad de un vídeo completo**: el vestuario fijo de quien sale y, sin lugar elegido, el sitio de la
   * biblia, repetidos literales (ya en inglés) en cada clip. Fuera de un vídeo completo la biblia está vacía y el
   * prompt es el de siempre.
   */
  const biblia = leerBibliaContinuidad(proyecto.continuityBible);
  const enPlano =
    escena.castFormat === "solo"
      ? [{ id: personaje.id, nombre: personaje.name }]
      : (await miembrosDelReparto(escena.id)).map((m) => ({ id: m.personajeId, nombre: m.nombre }));
  const escenaEnIngles = conContinuidad(
    conLugarSuelto(enIngles.get(prompt) ?? prompt, lugarDelPrompt(conLugar, enIngles, null)),
    bloqueDeContinuidad(biblia, enPlano, conLugar !== null),
  );
  const contextoEnIngles = enIngles.get(contexto) ?? contexto;
  // La dirección del clip (0.25.0) se aplica con el texto libre ya en inglés. En formato mudo el diálogo no
  // viaja, aunque el guion tenga texto: el clip sale con la boca cerrada y sin voz.
  const dirigido = dirigirClipPara(familiaDe(modelo.modelo), {
    ...(await direccionDeLaEscena(actor.id, escena, proyecto, {
      descripcion: "",
      real: !personaje.virtual,
      atractivoElegido: personaje.virtual && personaje.beautyOptIn,
      ejesVoz: personaje.voiceAxes,
    })),
    direccionVocal: enInglesO(matizDeVoz),
    instruccionesExtra: enInglesO(instrucciones),
    descripcionExperta: enInglesO(descripcionExperta),
    escena: escenaEnIngles,
    dialogo,
    producto:
      producto && conProducto
        ? productoEnPrompt(
            producto,
            producto.descripcionOriginal === "" ? "" : (enIngles.get(producto.descripcionOriginal) ?? ""),
            conProducto.reparto.producto > 0,
          )
        : null,
    // La duración resuelta para el modelo, no la planificada de la escena: es la que decide si el gesto cabe.
    segundos,
  });
  const dialogoFinal = dirigido.dialogo;
  /**
   * Qué se le manda al proveedor según el motor:
   *
   * - **identidad registrada**: su `character_ids` y nada más; la cara y la voz ya están allí;
   * - **referencias**: las fotos del personaje y la muestra de la voz del proyecto, que se suben al despachar
   *   (aquí solo se guardan sus identificadores: las URL del proveedor caducan y no se guardan nunca).
   */
  /**
   * Con identidad registrada la cara la pone el registro del proveedor, así que no hay referencia que elegir
   * ni nada que comparar: se apunta `vistas`, que es con lo que se registró el personaje.
   */
  const elegido = citaIdentidad
    ? null
    : await referenciasParaGenerar(
        personaje,
        modelo.parametros.maximoReferencias,
        // La hoja 3×3 cuenta igual que en el resto: la elegida por defecto, o la prueba que activó el usuario.
        conHojaDeIdentidad(personaje, escena.id),
      );
  const referencias = elegido?.referencias ?? [];

  /**
   * **Los envíos de esta escena** (0.28.0): uno, o dos si es un podcast. Se resuelven con el texto libre ya
   * traducido, porque la dirección vocal de cada turno viaja en inglés como el resto de lo que se describe; lo que
   * **no** pasa por la traducción es el texto del turno, que es lo que se va a oír.
   *
   * Sin reparto de dos, `envios` es `null` y se encola exactamente lo de siempre: un clip, con el
   * `character_ids` del protagonista y el prompt de un personaje hablando a cámara.
   */
  const envios = citaIdentidad ? await enviosDelReparto(escena, proyecto, enInglesO) : null;
  if (envios && envios.faltan.length > 0) {
    // No debería llegarse aquí: la regla `reparto-sin-registro` lo ha bloqueado antes de tocar el dinero. Si se
    // llega, se dice quién falta y no se envía nada, en lugar de mandar una cara inventada y cobrarla.
    const detalle = envios.faltan.map((f) => `«${f.nombre}» ${f.falta}`).join(" ");
    throw new ErrorOmni(409, `Esta escena no se puede producir todavía: ${detalle}`);
  }
  const clipsDelEnvio: (ClipDelReparto | null)[] = envios && envios.clips.length > 0 ? envios.clips : [null];
  if (clipsDelEnvio.length !== clipsEsperados) {
    throw new ErrorOmni(
      409,
      `El reparto pide ${clipsEsperados} clips, pero solo se han preparado ${clipsDelEnvio.length}. Revisa el reparto antes de confirmar: no se ha reservado ni cobrado nada.`,
    );
  }

  /**
   * **Experimental, apagado de fábrica** (Admin › Ajustes): con identidad registrada y lugar, el fotograma aprobado de
   * la escena —situado en su lugar— viaja junto a los `character_ids`. Con el ajuste general vale cualquier fotograma
   * aprobado; con el de los vídeos completos, solo su **plano base**. Sin ninguno, el lugar va solo descrito.
   */
  const { leerAjustes, combinarLugarConIdentidad } = await import("../ajustes");
  // Un plano base que ya no corresponde a la ficha, al lugar o a la ropa se retira aquí mismo: no se envía.
  const retiradas = await retirarPlanosCaducados(proyecto);
  const aprobado = retiradas.has(escena.id) ? null : escena.approvedFrameMediaId;
  const fotogramaSituado =
    citaIdentidad &&
    conLugar &&
    aprobado &&
    combinarLugarConIdentidad(await leerAjustes(), esPlanoBase(biblia, aprobado))
      ? aprobado
      : null;
  // El formato principal del proyecto (0.41.0): se comprueba contra el modelo antes de reservar nada.
  const proporcion = proporcionDelEnvio(proporcionFijadaDelProyecto(proyecto.formats), null, modelo);
  const trabajos: FilaTrabajo[] = [...yaEncoladas];
  let nuevas = 0;
  let fallo: string | null = null;
  for (const clip of clipsDelEnvio) {
    const orden = clip?.orden ?? 1;
    const clave = claveDelClip(orden);
    if (yaEncoladas.some((fila) => fila.idempotencyKey === clave)) continue;
    const personajesOmni = clip ? clip.personajesOmni : citaIdentidad && registro ? [registro.remoteCharacterId] : [];
    const promptDelClip = promptDelEnvio(dirigido.escena, contextoEnIngles, clip !== null);
    const parametros = adaptador.montarEntrada(modelo, {
      escena: promptDelClip,
      dialogo: dialogoFinal,
      urls: [],
      segundos,
      ...(personajesOmni.length > 0 ? { personajesOmni } : {}),
      ...(clip ? { reparto: clip.reparto } : {}),
      ...(proporcion ? { proporcion } : {}),
    });
    const valores: NuevoTrabajoEncolado = {
      userId: actor.id,
      kind: "animacion",
      provider: proveedor,
      model: modelo.modelo,
      // El despacho vuelve a montar la entrada desde esta columna, así que es el prompt de **este** clip.
      prompt: promptDelClip,
      identityReferenceKind: elegido?.referenciaIdentidad ?? "vistas",
      input: {
        prompt: promptDelClip,
        ...(enIngles.aviso === "" ? {} : { avisoReserva: enIngles.aviso }),
        // Si al enviarlo se exigía la declaración de marca.
        ...marcaAlEnviar(producto),
        /**
         * Con identidad registrada no hay referencias: la cara la pone el registro del proveedor. Con un motor de
         * referencias, son las fotos del personaje, y la muestra de la voz va aparte porque es audio y no imagen.
         */
        referencias: referenciasDelPersonajeQueViajan(referencias, conProducto?.reparto ?? null).map((r) => r.id),
        ...(muestraEnviada ? { audioDeReferencia: muestraEnviada.id } : {}),
        parametros: { ...parametros, segundos },
        ...(proporcion ? { proporcion } : {}),
        dialogo,
        escena: prompt,
        ...(contextoEnIngles === "" || clip !== null ? {} : { contextoPersonaje: contextoEnIngles }),
        /**
         * Identidad registrada con la que se encoló. El worker envía **esta** y no la que el personaje tenga
         * registrada al llegar su turno: lo que se paga tiene que ser lo que el usuario confirmó. Con dos
         * personajes son **dos** en un dualcast y **uno** en cada clip de podcast.
         */
        ...(personajesOmni.length > 0 ? { personajesOmni } : {}),
        // El reparto con el que se encoló: los lados y los turnos que confirmó el usuario, no los de después.
        ...(clip ? { reparto: clip.reparto } : {}),
        ...(fotogramaSituado ? { fotogramaSituado } : {}),
        // Fotos del producto que viajan con esta escena, ya repartidas contra el tope del modelo.
        ...(conProducto && producto && conProducto.reparto.producto > 0
          ? { referenciasProducto: producto.fotos.slice(0, conProducto.reparto.producto) }
          : {}),
        /**
         * Firma de la voz con la que sale, para poder decir después si lo generado sigue correspondiendo. Con un
         * motor de referencias la identidad es **el personaje y su muestra de voz**, no un identificador remoto.
         */
        firmaVoz: firmaDeVoz("omni", null, escena.scriptText, {
          audioId: citaIdentidad && voz ? voz.audioId : (muestraEnviada?.id ?? ""),
          personajeOmniId: personajesOmni[0] ?? personaje.id,
        }),
      },
      // El origen es la primera referencia cuando la hay: es lo que el historial enseña como punto de partida.
      sourceMediaId: referencias[0]?.id ?? fotogramaSituado ?? null,
      sceneId: escena.id,
      ...columnasDelLugar(conLugar?.lugar ?? null),
      // Turno del clip en el intercambio: es lo que el montaje (0.32.0) lee para alternar los planos.
      castClipOrder: clip ? clip.orden : null,
      // La declaración de marca se guarda con su fecha, igual que la de la imagen, cuando se exigió.
      brandRightsAt: fechaDeLaDeclaracionDeMarca(producto),
      // Cada clip de un podcast es de **su** personaje, con la ficha con la que está registrado.
      characterId: clip ? clip.personajeId : personaje.id,
      characterVersionId: clip && clip.personajeVersionId !== "" ? clip.personajeVersionId : version.id,
      referencesReviewedAt: new Date(),
      estimatedCredits: creditos,
    };
    try {
      const { fila, nueva } = await encolar({
        usuarioId: actor.id,
        claveIdempotencia: clave,
        proveedor,
        // Se acota con el coste de **este clip**, que escala con su duración, no con el precio de referencia.
        acotacion: acotarCoste("animacion", { ...eleccion, precio: { ...precio, creditos } }),
        valores,
        sello: precio.sello,
        // El tope por trabajo se mide con lo que cuesta **un** clip: es lo que este trabajo va a gastar.
        creditosDelEnvio: orden === 1 ? porClip : creditos,
        escena: {
          ...(await topeDeEscenas(escena.id, confirmacion.reintentoDeEscena ?? false)),
          clips: clipsEsperados,
        },
      });
      trabajos.push(fila);
      if (nueva) nuevas++;
    } catch (error) {
      /**
       * **Un clip que no sale no tira el otro** (0.28.0). Si el primero ya está encolado con su reserva apartada,
       * responder un error dejaría al usuario creyendo que no se ha hecho nada, y el clip pagado sin explicación.
       * Se para aquí, se deja escrita la causa concreta en la escena —que es lo que ve en la pantalla de
       * producción— y se devuelve lo que sí se encoló. Si no se ha encolado ninguno, el error se propaga tal cual.
       */
      if (trabajos.length === 0) throw error;
      fallo = `El clip ${orden} de esta conversación no se ha podido encolar y el otro sigue en marcha: ${(error as Error).message}`;
      await db()
        .update(scenes)
        .set({ lastFailureReason: fallo, updatedAt: new Date() })
        .where(eq(scenes.id, escena.id));
      break;
    }
  }
  return { trabajos, nuevas, fallo };
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
    throw new ErrorOmni(
      409,
      "Este proyecto no está en modo «Voz e identidad registradas», así que sus escenas no se producen así.",
    );
  }
  return { escena, proyecto };
}
