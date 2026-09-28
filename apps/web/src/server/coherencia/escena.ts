import { eq } from "drizzle-orm";
import type { Comprobacion, DecisionVista } from "@/lib/coherencia";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { leerObjeto } from "../almacenamiento";
import { escenaPropia } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, media } from "../db/esquema";
import { imagenParaModelo } from "../media/procesado";
import type { Actor } from "../media/servicio";
import { audioDelClip, ErrorAudioDelClip } from "./audio";
import { decidirCoherencia } from "./decidir";
import { ErrorPercepcion, percibir } from "./percepcion";
import { ultimaDecisionDe } from "./registro";

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

/** Imagen de un medio reducida para el modelo, o `null` si no se puede leer. */
async function imagenDe(medioId: string | null): Promise<{ mime: string; base64: string } | null> {
  if (!medioId) return null;
  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  if (!fila || fila.deletedAt !== null) return null;
  try {
    return await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  } catch (error) {
    console.error(`[coherencia] imagen ilegible de la escena: ${(error as Error).name}`);
    return null;
  }
}

/** Clip de la escena, si lo hay y sigue en la biblioteca. */
async function clipDe(escena: FilaEscena): Promise<FilaMedio | null> {
  if (!escena.clipMediaId) return null;
  const [fila] = await db().select().from(media).where(eq(media.id, escena.clipMediaId)).limit(1);
  return fila && fila.deletedAt === null ? fila : null;
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
      if (error instanceof ErrorPercepcion || error instanceof ErrorAudioDelClip) {
        resultado.sinComprobar.push({ comprobacion, motivo: error.message });
        return;
      }
      throw error;
    }
  };

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
    const imagen = await imagenDe(escena.approvedFrameMediaId ?? null);
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
    const clip = await clipDe(escena);
    if (!clip) return "Esta escena todavía no tiene clip, así que no hay voz que escuchar.";
    if (pedido.script_line === "") return "Sin guion escrito no hay tono con el que comparar la voz.";
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

  return resultado;
}

/** Decisiones ya guardadas de una escena, sin comprobar nada nuevo. Es lo que pinta la pantalla al abrirse. */
export async function coherenciaGuardadaDe(actor: Actor, escenaId: unknown): Promise<DecisionVista[]> {
  const { escena } = await escenaPropia(actor, escenaId);
  const ajustes = await leerAjustes();
  const decisiones: DecisionVista[] = [];
  for (const comprobacion of ["guion", "resultado", "emocion"] as const) {
    if (coherenciaDe(ajustes, comprobacion).modo === "apagada") continue;
    const decision = await ultimaDecisionDe(actor.id, escena.id, comprobacion);
    if (decision) decisiones.push(decision);
  }
  return decisiones;
}
