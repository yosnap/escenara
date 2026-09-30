import { eq, inArray } from "drizzle-orm";
import type { Comprobacion, DecisionVista } from "@/lib/coherencia";
import { ETIQUETA_LADO_REPARTO, type LadoReparto } from "@/lib/reparto";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { db } from "../db/cliente";
import { characters, type FilaEscena, type FilaMedio, type FilaProyecto, media } from "../db/esquema";
import { leerCatalogoDeDireccion, nombreDePreset } from "../direccion/catalogo";
import { type DireccionPedida, pedidoDeDireccion } from "../direccion/fidelidad";
import type { Actor } from "../media/servicio";
import { productoParaGenerar } from "../productos/prompt";
import { miembrosDelReparto, turnosDelReparto } from "../reparto/consulta";
import { audioDelClip, ErrorAudioDelClip } from "./audio";
import { decidirCoherencia, type ResultadoDecision } from "./decidir";
import { ErrorFotogramasDelClip, fotogramasDelClip } from "./fotogramas";
import { declaraCoherencia, identidadDeLaCaraGenerada } from "./identidad";
import { imagenDe } from "./imagen";
import { comprobarLugar } from "./lugar";
import { ErrorPercepcion, percibir, quedaCupoDePercepcion, SIN_CUPO_DE_PERCEPCION } from "./percepcion";
import { decisionPorId, ultimaDecisionDe, ultimaDecisionDePersonaje } from "./registro";

/**
 * Coherencia **de una escena**: las tres comprobaciones que nacen **en modo sombra** (propietario, 2026-09-28).
 *
 * - **guion** (antes de generar): si lo que se va a pedir cubre lo que cuenta el guion, incluido su tono. Un guion
 *   triste ilustrado con una escena alegre se señala aquí. No necesita percibir nada: es texto contra texto, así
 *   que no cuesta ni una llamada de percepción;
 * - **resultado** (después de generar): si lo que ha salido encaja con lo que se describió;
 * - **emoción** (después de generar): si la emoción de la cara y la de la voz encajan con el tono del guion.
 *
 * **Sombra quiere decir sombra**: nada de lo que sale de aquí bloquea una producción, invalida una revisión ni
 * cambia un veredicto. Se guarda con su evidencia para poder medir su acierto y se enseña en la pantalla de
 * revisión con la etiqueta de que no decide nada.
 *
 * Y no está en el camino crítico de ninguna generación: se pide **a mano** desde la pantalla de revisión, igual que
 * la revisión con modelo de 0.20.0, para que un fallo o una lentitud de Jev no puedan retrasar nunca lo que el
 * usuario ha pagado.
 */

/** Lo que se ha podido comprobar de una escena, con el motivo de lo que no. */
export interface CoherenciaDeEscena {
  decisiones: DecisionVista[];
  /** Comprobación que no se ha podido hacer, con su motivo. Nunca se calla un hueco. */
  sinComprobar: { comprobacion: Comprobacion; motivo: string }[];
}

/** Clip de la escena, si lo hay y sigue en la biblioteca. */
async function clipDe(escena: FilaEscena): Promise<FilaMedio | null> {
  if (!escena.clipMediaId) return null;
  const [fila] = await db().select().from(media).where(eq(media.id, escena.clipMediaId)).limit(1);
  return fila && fila.deletedAt === null ? fila : null;
}

/**
 * Puerta de privacidad de lo que sale de una escena: el fotograma lleva la cara del personaje y el clip su voz.
 * Solo se perciben si el personaje es inventado o si su consentimiento vigente declara la coherencia. Sin
 * personaje principal no se sabe de quién es la cara, así que tampoco se envía nada.
 * Devuelve el motivo por el que no se puede enviar, o `null` si se puede.
 */
async function motivoSinPermiso(proyecto: FilaProyecto): Promise<string | null> {
  if (!proyecto.mainCharacterId) {
    return "Este proyecto no tiene personaje principal, así que no se sabe de quién es la cara o la voz de la escena y no se envía nada al servicio de percepción.";
  }
  const [personaje] = await db()
    .select({ id: characters.id, virtual: characters.virtual })
    .from(characters)
    .where(eq(characters.id, proyecto.mainCharacterId))
    .limit(1);
  if (!personaje)
    return "El personaje de este proyecto ya no existe, así que no se envía nada al servicio de percepción.";
  if (personaje.virtual || (await declaraCoherencia(personaje.id))) return null;
  return "Para mirar el fotograma o escuchar el clip hay que enviar la cara y la voz del personaje a un modelo de percepción, y su consentimiento no lo cubre. Añade esa declaración en su consentimiento y vuelve a comprobarlo.";
}

/**
 * Lo que la escena pide, tal como se lo enseñamos a Jev. **No es el prompt**: el prompt lo compone el servidor al
 * producir y no sale de ahí (ADR-0022). Lo que se compara es lo que el usuario escribió, que es lo que él puede
 * reconocer en el veredicto.
 */
const pedidoDe = (escena: FilaEscena) => ({
  script_line: escena.scriptText.trim(),
  scene_description: escena.action.trim(),
});

/**
 * Comprueba la coherencia de una escena. Cada comprobación va por su cuenta: que la emoción no se pueda medir
 * (un clip mudo) no puede impedir medir el resultado.
 */
export async function comprobarEscena(actor: Actor, escenaId: unknown): Promise<CoherenciaDeEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const ajustes = await leerAjustes();
  const resultado: CoherenciaDeEscena = { decisiones: [], sinComprobar: [] };

  const anotar = async (comprobacion: Comprobacion, hacer: () => Promise<string>) => {
    if (coherenciaDe(ajustes, comprobacion).modo === "apagada") return;
    try {
      const motivo = await hacer();
      if (motivo !== "") {
        resultado.sinComprobar.push({ comprobacion, motivo });
        return;
      }
      const decision = await ultimaDecisionDe(actor.id, escena.id, comprobacion);
      if (decision) resultado.decisiones.push(decision);
    } catch (error) {
      if (
        error instanceof ErrorPercepcion ||
        error instanceof ErrorAudioDelClip ||
        error instanceof ErrorFotogramasDelClip
      ) {
        resultado.sinComprobar.push({ comprobacion, motivo: error.message });
        return;
      }
      throw error;
    }
  };

  /**
   * Si no queda cupo de percepción, no se empieza nada: las tres comprobaciones que perciben harían el trabajo
   * caro (convertir el audio, sacar la tira de fotogramas) para chocar después contra el mismo tope. Se dice
   * una vez, con la causa, en lugar de tres veces al final.
   */
  const conCupo = await quedaCupoDePercepcion(actor.id);

  const pedido = pedidoDe(escena);
  const sujeto = { tipo: "escena" as const, id: escena.id, proyectoId: proyecto.id };

  // Guion: texto contra texto. No se percibe nada, así que no gasta ni una llamada de percepción.
  await anotar("guion", async () => {
    if (pedido.script_line === "" || pedido.scene_description === "") {
      return "Esta escena todavía no tiene guion o no tiene descripción, así que no hay dos cosas que comparar.";
    }
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "guion",
      sujeto,
      percepcion: { hechos: pedido.scene_description, proveedor: "", modelo: "" },
      referencia: { script_line: pedido.script_line },
    });
    return decision.motivo;
  });

  // Resultado: se mira el fotograma aprobado, que es la imagen de la que sale el clip.
  await anotar("resultado", async () => {
    if (!conCupo) return SIN_CUPO_DE_PERCEPCION;
    if (!escena.approvedFrameMediaId) {
      return "Esta escena todavía no tiene fotograma aprobado, así que no hay resultado que mirar.";
    }
    const sinPermiso = await motivoSinPermiso(proyecto);
    if (sinPermiso) return sinPermiso;
    const imagen = await imagenDe(escena.approvedFrameMediaId);
    if (!imagen) return "Esta escena todavía no tiene fotograma aprobado, así que no hay resultado que mirar.";
    const percepcion = await percibir({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      clase: "escena",
      claveIdempotencia: `coherencia:resultado:${escena.id}`,
      imagen,
    });
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "resultado",
      sujeto,
      percepcion,
      referencia: pedido,
    });
    return decision.motivo;
  });

  // Emoción: la voz y el ambiente del clip contra el tono del guion.
  await anotar("emocion", async () => {
    if (!conCupo) return SIN_CUPO_DE_PERCEPCION;
    const clip = await clipDe(escena);
    if (!clip) return "Esta escena todavía no tiene clip, así que no hay voz que escuchar.";
    if (pedido.script_line === "") return "Sin guion escrito no hay tono con el que comparar la voz.";
    const sinPermiso = await motivoSinPermiso(proyecto);
    if (sinPermiso) return sinPermiso;
    const audio = await audioDelClip(clip.storageKey, clip.mimeType);
    const percepcion = await percibir({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      clase: "audio",
      claveIdempotencia: `coherencia:emocion:${escena.id}`,
      audio,
    });
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "emocion",
      sujeto,
      percepcion,
      referencia: pedido,
    });
    return decision.motivo;
  });

  // Fidelidad de la dirección: si el clip hace lo que el usuario dirigió. Se mira el **clip**, no el fotograma:
  // el plano y la luz ya los mide `resultado`, y lo que aquí importa es el movimiento, el gesto y el corte.
  await anotar("direccion_fiel", async () => {
    if (!conCupo) return SIN_CUPO_DE_PERCEPCION;
    const clip = await clipDe(escena);
    if (!clip) return "Esta escena todavía no tiene clip, así que no hay nada que comparar con lo que dirigiste.";
    const sinPermiso = await motivoSinPermiso(proyecto);
    if (sinPermiso) return sinPermiso;
    /**
     * Se mira **el clip**, no el fotograma. Lo que se pregunta es si la cámara se mueve como se pidió, si hay
     * un corte y si en un clip mudo mueve los labios: nada de eso se puede ver en una foto fija, y juzgarlo
     * sobre una daría siempre la misma respuesta vacía. Llega como tira de fotogramas en orden porque los
     * servicios de percepción ven imágenes y no vídeo.
     */
    const imagen = await fotogramasDelClip(clip.storageKey, clip.mimeType);
    const percepcion = await percibir({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      clase: "clip",
      claveIdempotencia: `coherencia:direccion:${escena.id}`,
      imagen,
    });
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "direccion_fiel",
      sujeto,
      percepcion,
      referencia: pedidoDeDireccion(await direccionPedidaDe(actor.id, escena)),
    });
    return decision.motivo;
  });

  /**
   * Fidelidad del producto: si lo que ha salido es **el mismo producto, con la misma etiqueta**.
   *
   * Se mira lo mismo que mira el usuario cuando lo juzga: el **clip** si la escena ya lo tiene —porque el
   * producto se gira, se abre y se manipula, y la etiqueta puede cambiar a mitad de plano—, y el fotograma
   * aprobado mientras no haya clip. La referencia es la **primera foto del producto**, que es la frontal con
   * la etiqueta: la que esta versión promete conservar.
   *
   * Las dos se describen por separado y con instrucciones distintas —el producto se transcribe palabra por
   * palabra— y es Jev quien las compara. Describirlas juntas dejaría comparar al modelo de percepción, que es
   * justo lo que aquí no queremos que haga.
   */
  await anotar("producto_fiel", async () => {
    if (!conCupo) return SIN_CUPO_DE_PERCEPCION;
    if (!escena.productId) return "Esta escena no lleva ningún producto, así que no hay nada que comparar.";
    const producto = await productoParaGenerar(actor.id, escena.productId, escena.productAction);
    const fotoId = producto?.fotos[0];
    if (!producto || !fotoId) {
      return "Este producto no tiene ninguna foto de referencia, así que no hay con qué comparar lo generado. Añade al menos la frontal con la etiqueta.";
    }
    const clip = await clipDe(escena);
    if (!clip && !escena.approvedFrameMediaId) {
      return "Esta escena todavía no tiene fotograma aprobado ni clip, así que no hay resultado en el que mirar el producto.";
    }
    // El fotograma y el clip llevan la cara del personaje: la misma puerta de privacidad que el resto.
    const sinPermiso = await motivoSinPermiso(proyecto);
    if (sinPermiso) return sinPermiso;
    const referencia = await imagenDe(fotoId);
    if (!referencia) return "La foto de referencia de este producto ya no se puede leer.";
    const resultadoVisto = clip
      ? await fotogramasDelClip(clip.storageKey, clip.mimeType)
      : await imagenDe(escena.approvedFrameMediaId);
    if (!resultadoVisto) {
      return "Esta escena todavía no tiene fotograma aprobado ni clip, así que no hay resultado en el que mirar el producto.";
    }
    const [hechosResultado, hechosProducto] = await Promise.all([
      percibir({
        usuarioId: actor.id,
        proyectoId: proyecto.id,
        clase: "producto",
        claveIdempotencia: `coherencia:producto:${escena.id}:${clip ? "clip" : "fotograma"}`,
        imagen: resultadoVisto,
      }),
      percibir({
        usuarioId: actor.id,
        proyectoId: proyecto.id,
        clase: "producto",
        claveIdempotencia: `coherencia:producto:${escena.id}:referencia:${fotoId}`,
        imagen: referencia,
      }),
    ]);
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "producto_fiel",
      sujeto,
      percepcion: hechosResultado,
      referencia: {
        product_reference: hechosProducto.hechos,
        // Lo que el usuario escribió y pulsó, en castellano: es lo que puede reconocer en la evidencia.
        product_name: producto.nombre,
        product_description: producto.descripcionOriginal || "sin descripción",
        product_action: producto.nombreAccion || "sin elegir",
      },
    });
    return decision.motivo;
  });

  // Fidelidad del lugar: el sitio del fotograma es el de su maestra. No se mira si sale una persona real.
  await anotar("lugar_fiel", () => comprobarLugar(actor.id, escena, proyecto, sujeto));

  /**
   * **El diálogo se repartió como se pidió** (0.28.0), en una escena de dos personajes.
   *
   * Se escucha **el clip**, no se mira: quién dice cada frase está en el audio y no en una imagen. La percepción
   * transcribe los turnos por voces sin identificar a nadie (`clase: "dialogo"`), y lo que Jev compara es esa
   * transcripción con los turnos tal como el usuario los escribió, en castellano y literales.
   *
   * Una escena de un personaje no se comprueba: no hay reparto que juzgar, y preguntarlo gastaría una percepción
   * para responder siempre lo mismo.
   */
  await anotar("reparto_fiel", async () => {
    if (!conCupo) return SIN_CUPO_DE_PERCEPCION;
    if (escena.castFormat === "solo") {
      return "Esta escena es de un solo personaje, así que no hay diálogo repartido que comprobar.";
    }
    const turnos = await turnosDelReparto(escena.id);
    if (turnos.length === 0) {
      return "El diálogo de esta escena no está repartido por turnos, así que no hay reparto pedido con el que comparar lo que se oye.";
    }
    const clip = await clipDe(escena);
    if (!clip) return "Esta escena todavía no tiene clip, así que no hay conversación que escuchar.";
    const sinPermiso = await motivoSinPermiso(proyecto);
    if (sinPermiso) return sinPermiso;
    const audio = await audioDelClip(clip.storageKey, clip.mimeType);
    const percepcion = await percibir({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      clase: "dialogo",
      claveIdempotencia: `coherencia:reparto:${escena.id}:${clip.id}`,
      audio,
    });
    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "reparto_fiel",
      sujeto,
      percepcion,
      referencia: {
        cast_format: escena.castFormat,
        // Los turnos van tal como se pidieron, con el nombre de quién habla y su frase **literal**, sin traducir.
        requested_turns: turnos.map((t, i) => `${i + 1}. ${t.nombre}: "${t.texto}"`).join("\n"),
      },
    });
    return decision.motivo;
  });

  /**
   * **La cara de cada personaje es la suya** (0.28.0): con dos personajes se comprueba **dos veces**, cada una
   * contra la referencia de su personaje y con el lado del cuadro en el que se le pidió salir.
   *
   * Va fuera de `anotar` porque son varias decisiones de la **misma** comprobación sobre la misma escena, y lo que
   * las distingue es de quién habla cada una: se añaden a mano, con su etiqueta en castellano.
   */
  if (coherenciaDe(ajustes, "identidad").modo !== "apagada") {
    for (const { motivo, decision, sobre } of await identidadesDelReparto(actor, escena, proyecto, conCupo)) {
      if (motivo !== "") {
        resultado.sinComprobar.push({ comprobacion: "identidad", motivo });
        continue;
      }
      if (decision?.decisionId) {
        const guardada = await decisionPorId(actor.id, decision.decisionId);
        if (guardada) resultado.decisiones.push({ ...guardada, sobre });
      }
    }
  }

  return resultado;
}

/**
 * Comprueba la identidad de **cada** personaje del reparto contra su propia referencia. Devuelve una entrada por
 * personaje: o su decisión, o el motivo por el que no se ha podido comprobar la suya.
 *
 * Lo que se mira es el **clip** si la escena ya lo tiene, y el fotograma aprobado mientras no lo haya: es lo mismo
 * que mira el usuario cuando juzga si la cara es la que pidió. Con un solo personaje **no se hace nada**: su cara
 * ya la cubre la comprobación de sus vistas generadas, y repetirla aquí gastaría dos percepciones por escena.
 */
async function identidadesDelReparto(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  conCupo: boolean,
): Promise<{ motivo: string; decision: ResultadoDecision | null; sobre: string }[]> {
  if (escena.castFormat === "solo") return [];
  const miembros = await miembrosDelReparto(escena.id);
  if (miembros.length < 2) return [];
  const etiqueta = (nombre: string, lado: LadoReparto) => `${nombre}, ${ETIQUETA_LADO_REPARTO[lado].toLowerCase()}`;
  if (!conCupo) {
    return miembros.map((m) => ({ motivo: SIN_CUPO_DE_PERCEPCION, decision: null, sobre: etiqueta(m.nombre, m.lado) }));
  }
  const clip = await clipDe(escena);
  if (!clip && !escena.approvedFrameMediaId) {
    return [
      {
        motivo: "Esta escena todavía no tiene clip ni fotograma aprobado, así que no hay ninguna cara que comparar.",
        decision: null,
        sobre: "",
      },
    ];
  }
  const visto = clip
    ? await fotogramasDelClip(clip.storageKey, clip.mimeType)
    : await imagenDe(escena.approvedFrameMediaId);
  if (!visto) {
    return [
      { motivo: "No se ha podido leer lo generado de esta escena para comparar las caras.", decision: null, sobre: "" },
    ];
  }
  const filas = await db()
    .select({
      id: characters.id,
      name: characters.name,
      kind: characters.kind,
      virtual: characters.virtual,
      ownerId: characters.ownerId,
    })
    .from(characters)
    .where(
      inArray(
        characters.id,
        miembros.map((m) => m.personajeId),
      ),
    );
  const porId = new Map(filas.map((f) => [f.id, f]));
  const salida: { motivo: string; decision: ResultadoDecision | null; sobre: string }[] = [];
  for (const miembro of miembros) {
    const sobre = etiqueta(miembro.nombre, miembro.lado);
    const personaje = porId.get(miembro.personajeId);
    if (!personaje) {
      salida.push({
        motivo: `«${miembro.nombre}» ya no existe, así que no hay con qué comparar su cara.`,
        decision: null,
        sobre,
      });
      continue;
    }
    const { decision, motivo } = await identidadDeLaCaraGenerada({
      personaje,
      sujeto: { tipo: "escena", id: escena.id, personajeId: personaje.id, proyectoId: proyecto.id },
      generada: visto,
      claveIdempotencia: `coherencia:identidad:escena:${escena.id}:${personaje.id}:${clip ? clip.id : "fotograma"}`,
      lado: ETIQUETA_LADO_REPARTO[miembro.lado].toLowerCase(),
    });
    salida.push({ motivo, decision, sobre });
  }
  return salida;
}

/**
 * Lo que el usuario dirigió, con los **nombres del catálogo en castellano**: son los que él pulsó y los únicos
 * que puede reconocer en la evidencia de un veredicto.
 */
async function direccionPedidaDe(usuarioId: string, escena: FilaEscena): Promise<DireccionPedida> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  const nombre = (categoria: Parameters<typeof nombreDePreset>[1], clave: string) =>
    nombreDePreset(catalogo, categoria, clave);
  return {
    formato: escena.clipFormat,
    plano: nombre("plano", escena.shotType),
    angulo: nombre("angulo", escena.cameraAngle),
    movimientoCamara: nombre("camara", escena.cameraMove),
    microaccion: nombre("microaccion", escena.microAction),
    momentoMicroaccion: escena.microActionTiming,
  };
}

/** Decisiones ya guardadas de una escena, sin comprobar nada nuevo. Es lo que pinta la pantalla al abrirse. */
export async function coherenciaGuardadaDe(actor: Actor, escenaId: unknown): Promise<DecisionVista[]> {
  const { escena } = await escenaPropia(actor, escenaId);
  const ajustes = await leerAjustes();
  const decisiones: DecisionVista[] = [];
  for (const comprobacion of [
    "guion",
    "resultado",
    "emocion",
    "direccion_fiel",
    "producto_fiel",
    "reparto_fiel",
    "lugar_fiel",
  ] as const) {
    if (coherenciaDe(ajustes, comprobacion).modo === "apagada") continue;
    const decision = await ultimaDecisionDe(actor.id, escena.id, comprobacion);
    if (decision) decisiones.push(decision);
  }
  /**
   * La identidad de una escena de dos personajes es **una decisión por personaje** (0.28.0): se leen las dos, cada
   * una con la etiqueta de quién es, porque una sola diría «la cara no cuadra» sin decir cuál de las dos.
   */
  if (escena.castFormat !== "solo" && coherenciaDe(ajustes, "identidad").modo !== "apagada") {
    for (const miembro of await miembrosDelReparto(escena.id)) {
      const decision = await ultimaDecisionDePersonaje(actor.id, escena.id, "identidad", miembro.personajeId);
      if (decision) {
        decisiones.push({
          ...decision,
          sobre: `${miembro.nombre}, ${ETIQUETA_LADO_REPARTO[miembro.lado].toLowerCase()}`,
        });
      }
    }
  }
  return decisiones;
}
