import { eq } from "drizzle-orm";
import { CAPACIDAD_DE_TIPO, duracionesConCoste, type ModeloVista, segundosDeUnidad } from "@/lib/catalogo";
import type { Medio } from "@/lib/media/tipos";
import { creditosDeEscenaOmni, precioOmniEstimado, usaIdentidadRegistrada, type VozOmniDelProyecto } from "@/lib/omni";
import { duracionParaModelo } from "@/lib/produccion";
import { firmaDeVoz, nombreDeVoz } from "@/lib/voz";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { techoDelProyecto } from "../asistente/plan";
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
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { exigirSelloVigente } from "../generacion/precios";
import type { Actor } from "../media/servicio";
import { referenciasVigentesDe } from "../personajes/consulta";
import { contextoDeVersion, promptConContexto } from "../personajes/contexto";
import { ultimaVersion } from "../personajes/ficha";
import { personajePropio, referenciasParaGenerar } from "../personajes/puede-generar";
import { acotarCoste } from "../presupuesto/acotar";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { hechosDelProducto, productoEnPrompt, productoParaGenerar } from "../productos/prompt";
import { creditosDelEnvio, traducirAlIngles } from "../prompts/traduccion";
import { miembrosDelReparto } from "../reparto/consulta";
import { exigirFormatoActivo } from "../reparto/servicio";
import { muestrasDe } from "../voz/muestra";
import { vozOmniDelProyecto } from "../voz/omni";
import { vozDelProyecto } from "../voz/proyecto";
import { ErrorOmni } from "./errores";
import { eleccionOmni, registroVigente } from "./registro";
import { type ClipDelReparto, clipsEsperadosDe, enviosDelReparto, faltasDeRegistroDelReparto } from "./reparto";

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

/** Segundos que se le pedirán al modelo: los del proyecto si Omni los admite, y si no, los que admita. */
export const segundosDeEscenaOmni = (duraciones: readonly number[], proyecto: FilaProyecto): number =>
  duracionParaModelo(duraciones, proyecto.clipSeconds);

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

/**
 * Créditos de una escena hablada con la duración del proyecto. Se calcula en un solo sitio para que la cifra que
 * se muestra, la que se confirma y la que se aparta sean la misma.
 */
export async function creditosDeEscenaHablada(
  usuarioId: string,
  proyecto: FilaProyecto,
): Promise<{ creditos: number; sello: string }> {
  /**
   * Se lee **dos veces a propósito**: primero para saber qué modelo sería y qué duración admite, y después con
   * esa duración para leer **su** tarifa. Desde la 0.23.4 cada duración de Gemini Omni tiene su precio publicado
   * (63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s), así que la escena se cobra por la tarifa de su duración en
   * lugar de escalar la de 4 s. Solo se escala lo que no tenga tarifa propia, y se dice que es estimado.
   */
  const { modelo: primero } = await eleccionOmni(usuarioId);
  const segundos = segundosDeEscenaOmni(duracionesDeOmni(primero), proyecto);
  const { modelo, precio } = await eleccionOmni(usuarioId, segundos);
  return { creditos: creditosDeTarifa(precio, segundos, modelo.modelo), sello: precio.sello };
}

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
 * Registro con el que se va a producir: el del protagonista, su versión de ficha vigente y la voz del proyecto.
 * Sin él no se produce nada y se dice exactamente qué falta, porque registrar **no cuesta créditos** y por tanto
 * la salida siempre está a un clic.
 */
export async function registroParaProducir(
  actor: Actor,
  proyecto: FilaProyecto,
  /** Modelo con el que se va a producir; sin él se mira el que elegiría el mapa ahora mismo. */
  modelo?: string,
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
  const conRegistro = usaIdentidadRegistrada(modelo ?? (await modeloDeEscenaHablada(actor.id)));
  if (!conRegistro) return referenciasParaProducir(actor, proyecto);
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

/** Modelo con el que se produciría ahora mismo una escena hablada; vacío si no hay ninguno utilizable. */
async function modeloDeEscenaHablada(usuarioId: string): Promise<string> {
  try {
    return (await eleccionOmni(usuarioId)).modelo.modelo;
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
        "Quita el producto de esta escena antes de generar: sus fotos no pueden viajar junto con las dos identidades registradas de Omni.",
      );
    }
  }
  exigirDerechos(confirmacion.derechos);
  exigirRevisionDeReferencias(confirmacion.sinTerceros);
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const { modelo: primero } = await eleccionOmni(actor.id);
  const eleccion = await eleccionOmni(actor.id, segundosDeEscenaOmni(duracionesDeOmni(primero), proyecto));
  const { modelo, adaptador, precio } = eleccion;
  const segundos = segundosDeEscenaOmni(duracionesDeOmni(modelo), proyecto);
  const creditos = creditosDeTarifa(precio, segundos, modelo.modelo);
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  /**
   * **El coste se confirma una vez y por el total** (0.28.0). Cada clip cuesta lo mismo —la misma tarifa y la
   * misma duración—, y la traducción del texto de la escena se paga una sola vez porque se hace una sola vez. Así
   * que el total es el de un envío más lo que cuesta cada clip de más. Confirmar el coste de **un** clip cuando
   * son dos se rechaza aquí: es exactamente lo que `exigirConfirmacion` existe para impedir.
   */
  const clipsEsperados = await clipsEsperadosDe(escena);
  const porClip = await creditosDelEnvio(creditos);
  const totales = porClip + creditos * (clipsEsperados - 1);
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
  const { personaje, version, registro, voz, falta, muestra } = await registroParaProducir(
    actor,
    proyecto,
    modelo.modelo,
  );

  /**
   * **El producto de la escena** (0.26.0) y lo que cuesta llevarlo en modo Omni.
   *
   * `character_ids` y las imágenes de referencia son excluyentes en este modelo, así que una escena con
   * producto **renuncia a la identidad registrada**: la cara sale de las fotos del personaje y la voz deja de
   * ser la registrada, con lo que puede variar entre escenas. Es una decisión del usuario y por eso se avisa
   * antes de cobrar (`producto-sin-identidad-registrada`) con la alternativa de hacer el producto en un plano
   * aparte y montarlo.
   */
  const producto = await productoParaGenerar(actor.id, escena.productId, escena.productAction);
  // Lo que de verdad se va a enviar: con producto no se cita la identidad registrada aunque el motor la tenga.
  const citaIdentidad = conIdentidad && producto === null;
  /**
   * Sin la identidad registrada, la voz tiene que ir como muestra de audio, igual que en el motor de referencias.
   * El registro no la carga, así que se lee aquí: sin ella el clip saldría con una voz inventada y se cobraría.
   */
  const sinRegistro = conIdentidad && !citaIdentidad ? await referenciasParaProducir(actor, proyecto) : null;
  const muestraEnviada = sinRegistro ? (sinRegistro.muestra ?? null) : muestra;
  const faltaEnviada = sinRegistro?.falta || falta;
  const conProducto = producto
    ? hechosDelProducto(
        producto,
        adaptador.referenciasDeGaleria?.(modelo) ?? modelo.parametros.maximoReferencias,
        personaje ? (await referenciasVigentesDe(personaje.id)).length : 1,
        conIdentidad,
      )
    : null;
  if (producto) exigirDerechoDeMarca(confirmacion.derechoMarca);
  if (conProducto) await completarModelosSugeridos(conProducto.hechos, CAPACIDAD_DE_TIPO.animacion);

  /**
   * El reparto de la escena (0.28.0): en una escena hablada con dos personajes, **cada persona real** necesita su
   * consentimiento, cada uno necesita **su registro en el proveedor** y el diálogo tiene que caber en el clip. Los
   * tres se evalúan en el motor, antes de tocar un crédito, y el motivo nombra a quién le falta qué.
   */
  const conReparto = await hechosDelReparto(escena, {
    segundosPorClip: segundos,
    sinRegistrar: citaIdentidad ? await faltasDeRegistroDelReparto(escena, voz?.audioId ?? "") : [],
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
    ],
    h.buscar,
  );
  const enInglesO = (texto: string) => (texto === "" ? "" : (enIngles.get(texto) ?? texto));
  const escenaEnIngles = enIngles.get(prompt) ?? prompt;
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
  const promptFinal = promptConContexto(dirigido.escena, contextoEnIngles);
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
  const envios = citaIdentidad ? await enviosDelReparto(escena, voz?.audioId ?? "", enInglesO) : null;
  if (envios && envios.faltan.length > 0) {
    // No debería llegarse aquí: la regla `reparto-sin-registro` lo ha bloqueado antes de tocar el dinero. Si se
    // llega, se dice quién falta y no se envía nada, en lugar de mandar una cara inventada y cobrarla.
    const detalle = envios.faltan.map((f) => `«${f.nombre}» ${f.falta}`).join(" ");
    throw new ErrorOmni(409, `Esta escena no se puede producir todavía: ${detalle}`);
  }
  const clipsDelEnvio: (ClipDelReparto | null)[] = envios && envios.clips.length > 0 ? envios.clips : [null];

  const trabajos: FilaTrabajo[] = [...yaEncoladas];
  let nuevas = 0;
  let fallo: string | null = null;
  for (const clip of clipsDelEnvio) {
    const orden = clip?.orden ?? 1;
    const clave = claveDelClip(orden);
    if (yaEncoladas.some((fila) => fila.idempotencyKey === clave)) continue;
    const personajesOmni = clip ? clip.personajesOmni : citaIdentidad && registro ? [registro.remoteCharacterId] : [];
    const parametros = adaptador.montarEntrada(modelo, {
      escena: promptFinal,
      dialogo: dialogoFinal,
      urls: [],
      segundos,
      ...(personajesOmni.length > 0 ? { personajesOmni } : {}),
      ...(clip ? { reparto: clip.reparto } : {}),
    });
    const valores: NuevoTrabajoEncolado = {
      userId: actor.id,
      kind: "animacion",
      provider: proveedor,
      model: modelo.modelo,
      prompt: promptFinal,
      identityReferenceKind: elegido?.referenciaIdentidad ?? "vistas",
      input: {
        prompt: promptFinal,
        /**
         * Con identidad registrada no hay referencias: la cara la pone el registro del proveedor. Con un motor de
         * referencias, son las fotos del personaje, y la muestra de la voz va aparte porque es audio y no imagen.
         */
        referencias: referencias.map((r) => r.id),
        ...(muestraEnviada ? { audioDeReferencia: muestraEnviada.id } : {}),
        parametros: { ...parametros, segundos },
        dialogo,
        escena: prompt,
        ...(contextoEnIngles === "" ? {} : { contextoPersonaje: contextoEnIngles }),
        /**
         * Identidad registrada con la que se encoló. El worker envía **esta** y no la que el personaje tenga
         * registrada al llegar su turno: lo que se paga tiene que ser lo que el usuario confirmó. Con dos
         * personajes son **dos** en un dualcast y **uno** en cada clip de podcast.
         */
        ...(personajesOmni.length > 0 ? { personajesOmni } : {}),
        // El reparto con el que se encoló: los lados y los turnos que confirmó el usuario, no los de después.
        ...(clip ? { reparto: clip.reparto } : {}),
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
      sourceMediaId: referencias[0]?.id ?? null,
      sceneId: escena.id,
      // Turno del clip en el intercambio: es lo que el montaje (0.32.0) lee para alternar los planos.
      castClipOrder: clip ? clip.orden : null,
      // La declaración de marca se guarda con su fecha, igual que la de la imagen.
      brandRightsAt: producto ? new Date() : null,
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
    throw new ErrorOmni(409, "Este proyecto no está en modo Omni, así que sus escenas no se producen así.");
  }
  return { escena, proyecto };
}
