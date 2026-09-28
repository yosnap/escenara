import { asc, eq } from "drizzle-orm";
import type { DecisionVista } from "@/lib/coherencia";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { listarAngulos } from "../anuncio/catalogo";
import { proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { adBriefs, offers } from "../db/esquema-anuncio";
import { scenes } from "../db/esquema-proyectos";
import type { Actor } from "../media/servicio";
import { decidirCoherencia } from "./decidir";
import { ultimaDecisionDe } from "./registro";

/**
 * **`angulo_fiel`**: si el guion del anuncio responde al ángulo que se eligió, no mezcla otros y dice la oferta
 * como se definió (0.27.0).
 *
 * Tres cosas la distinguen del resto de las comprobaciones de coherencia:
 *
 * - **su sujeto es el proyecto, no la escena**. Un proyecto es un anuncio y un anuncio tiene un ángulo: una
 *   escena suelta no puede decir si el anuncio mezcla dos, que es justo lo que hay que detectar. Por eso el
 *   sujeto es `proyecto` y lo que se juzga es el guion entero, en orden;
 * - **no percibe nada**. Es texto contra texto, como `guion`: no cuesta ninguna llamada de percepción, no
 *   envía ninguna cara ni ninguna voz a ningún sitio y por tanto no tiene puerta de privacidad que abrir;
 * - **nace en sombra** (decisión 5 de las preguntas resueltas) y su modo y su umbral son ajustes de
 *   Admin › Coherencia, como los demás. En sombra **no bloquea nada**: ni la aprobación del plan, ni la
 *   producción, ni pedir otro guion. Se registra con su evidencia para poder medir su acierto.
 *
 * Los **otros ángulos del catálogo** entran en el estado que ve Jev, con su definición: es lo que permite que el
 * veredicto diga **cuáles** se mezclan en lugar de decir solo que se mezcla algo.
 */

/** Lo que se ha podido comprobar del ángulo de un anuncio, con el motivo de lo que no. */
export interface CoherenciaDelAngulo {
  decision: DecisionVista | null;
  /** Por qué no hay decisión, en lenguaje llano. Vacío cuando sí la hay. */
  motivo: string;
}

/** Tope del guion que se le enseña a Jev. Doce escenas de un vertical corto caben de sobra. */
const GUION_MAXIMO = 4000;

/** El guion del proyecto, en orden y con el número de escena: el orden es parte de cómo entra un ángulo. */
async function guionDelProyecto(proyectoId: string): Promise<string> {
  const filas = await db()
    .select({ orden: scenes.sortOrder, texto: scenes.scriptText })
    .from(scenes)
    .where(eq(scenes.projectId, proyectoId))
    .orderBy(asc(scenes.sortOrder));
  return filas
    .map((f) => f.texto.trim())
    .filter((t) => t !== "")
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n")
    .slice(0, GUION_MAXIMO);
}

/**
 * Comprueba el ángulo del anuncio de un proyecto propio. **No bloquea nada**: en sombra el veredicto queda
 * escrito y no mueve una coma, y quien lo llama solo lo enseña.
 *
 * Se pide **a mano**, como el resto de la coherencia de 0.24.0: así un fallo o una lentitud de Jev no pueden
 * retrasar nunca algo que el usuario ha pagado.
 */
export async function comprobarAnguloDelAnuncio(actor: Actor, proyectoId: unknown): Promise<CoherenciaDelAngulo> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const ajustes = await leerAjustes();
  if (coherenciaDe(ajustes, "angulo_fiel").modo === "apagada") {
    return {
      decision: null,
      motivo:
        "La comprobación del ángulo está apagada en esta instalación. Quien la administra puede encenderla en Admin › Ajustes › Coherencia.",
    };
  }

  const [brief] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyecto.id)).limit(1);
  if (!brief || brief.anglePresetKey === "") {
    return {
      decision: null,
      motivo:
        "Este proyecto no tiene un ángulo elegido en su brief, así que no hay con qué comparar el guion. Elige el ángulo del anuncio en el brief.",
    };
  }
  const angulos = await listarAngulos();
  const angulo = angulos.find((a) => a.clave === brief.anglePresetKey);
  if (!angulo) {
    return {
      decision: null,
      motivo:
        "El ángulo que tenía este brief ya no está en el catálogo de esta instalación, así que no hay definición de referencia con la que comparar el guion.",
    };
  }
  const guion = await guionDelProyecto(proyecto.id);
  if (guion === "") {
    return {
      decision: null,
      motivo: "Este proyecto todavía no tiene guion escrito, así que no hay nada que comparar con el ángulo.",
    };
  }

  const [oferta] = brief.offerId ? await db().select().from(offers).where(eq(offers.id, brief.offerId)).limit(1) : [];
  const vigente = oferta && oferta.deletedAt === null ? oferta : null;

  const decision = await decidirCoherencia({
    usuarioId: actor.id,
    comprobacion: "angulo_fiel",
    sujeto: { tipo: "proyecto", id: proyecto.id, proyectoId: proyecto.id },
    // El «percibido» es el propio guion: aquí no hay modelo de percepción de por medio, y decirlo con los campos
    // vacíos es lo honesto. La evidencia guardada dirá que lo que se miró fue el guion.
    percepcion: { hechos: guion, proveedor: "", modelo: "" },
    referencia: {
      angle_name: angulo.nombre,
      angle_definition: angulo.definicion,
      angle_entry_point: angulo.porDondeEntra,
      angle_example: angulo.ejemplo,
      // Los otros ángulos con su definición: es con lo que se compara para decidir si se mezclan.
      other_angles: angulos
        .filter((a) => a.clave !== angulo.clave)
        .map((a) => `${a.nombre}: ${a.definicion}`)
        .join(" | "),
      // La oferta **como se definió**. Lo que está vacío se dice que está vacío: si el guion promete una garantía
      // que nadie escribió, eso es exactamente lo que hay que detectar.
      offer_what_they_get: vigente?.whatTheyGet ?? "sin oferta definida",
      offer_price: vigente?.price ?? "no definido por el anunciante",
      offer_guarantee: vigente?.guarantee ?? "no definido por el anunciante",
      offer_urgency: vigente?.urgency ?? "no definido por el anunciante",
      offer_bonus: vigente?.bonus ?? "no definido por el anunciante",
    },
  });
  if (decision.motivo !== "") return { decision: null, motivo: decision.motivo };
  return { decision: await ultimaDecisionDe(actor.id, proyecto.id, "angulo_fiel"), motivo: "" };
}

/** El último veredicto del ángulo ya guardado, sin comprobar nada nuevo. Es lo que pinta la pantalla al abrirse. */
export async function anguloFielGuardadoDe(actor: Actor, proyectoId: unknown): Promise<DecisionVista | null> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const ajustes = await leerAjustes();
  if (coherenciaDe(ajustes, "angulo_fiel").modo === "apagada") return null;
  return ultimaDecisionDe(actor.id, proyecto.id, "angulo_fiel");
}
