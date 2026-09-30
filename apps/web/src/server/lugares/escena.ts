import { and, eq, isNotNull, or } from "drizzle-orm";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { esPlanoDelLugar, SITIO_EN_LUGAR_MAXIMO } from "@/lib/lugares";
import { motivoDeInvalidacion } from "@/lib/proyectos";
import type { Ejecutor } from "../db/cliente";
import { type FilaEscena, type FilaProyecto, projects, scenes } from "../db/esquema";
import { ErrorLugar } from "./errores";
import {
  acabadoDelProyecto,
  acabadoDistinto,
  exigirLugarPropio,
  lugarDeLaEscena,
  lugarParaGenerar,
} from "./para-generar";

/**
 * **El lugar del proyecto y de la escena.** El proyecto puede tener un lugar por defecto que heredan sus escenas;
 * cada escena puede cambiarlo, quitarlo o volver a heredarlo, y decir dónde, dentro del lugar, ocurre.
 *
 * Todo se comprueba **en el servidor**: el lugar tiene que ser del usuario (404 si no, sin decir que existe) y su
 * acabado tiene que casar con el del proyecto. En un proyecto animado, un lugar real no se acepta ni por la API.
 */

type CamposEscena = Partial<typeof scenes.$inferInsert>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rechaza un lugar cuyo acabado no casa con el del proyecto, con la causa. */
async function exigirAcabadoDelProyecto(usuarioId: string, lugarId: string, proyectoId: string): Promise<void> {
  const lugar = await lugarParaGenerar(usuarioId, { lugarId, sitio: "", soloLugar: false });
  if (!lugar) throw new ErrorLugar(404, "Ese lugar no existe.");
  const motivo = acabadoDistinto(lugar, await acabadoDelProyecto(proyectoId));
  if (motivo) throw new ErrorLugar(409, `${motivo} Elige un lugar con el mismo acabado.`);
}

/**
 * Los campos de lugar de una escena, ya comprobados. `{}` si no llega nada: lo que no se manda, no se toca.
 *
 * - `{ heredar: true }`: vuelve al lugar del proyecto;
 * - `{ lugarId: "" }` o `null`: sin lugar, aunque el proyecto tenga uno;
 * - `{ lugarId, sitio?, plano? }`: ese lugar, dónde dentro de él y si es el plano del lugar solo.
 */
export async function camposDeLugar(usuarioId: string, proyecto: FilaProyecto, valor: unknown): Promise<CamposEscena> {
  if (valor === undefined) return {};
  if (valor === null) return { placeId: null, placeInherited: false, placeSpot: "", placeShot: "con_reparto" };
  if (typeof valor !== "object" || Array.isArray(valor))
    throw new ErrorLugar(400, "El lugar de la escena no es válido.");
  const c = valor as Record<string, unknown>;
  const sitio = limpiarTextoDePrompt(c.sitio ?? "", SITIO_EN_LUGAR_MAXIMO);
  const plano = c.plano ?? "con_reparto";
  if (!esPlanoDelLugar(plano)) throw new ErrorLugar(400, "El plano del lugar es «con reparto» o «el lugar solo».");
  if (c.heredar === true) return { placeId: null, placeInherited: true, placeSpot: sitio, placeShot: plano };
  const lugarId = c.lugarId ?? "";
  if (lugarId === "") return { placeId: null, placeInherited: false, placeSpot: "", placeShot: "con_reparto" };
  if (typeof lugarId !== "string" || !UUID.test(lugarId)) throw new ErrorLugar(400, "Ese lugar no es válido.");
  await exigirLugarPropio(usuarioId, lugarId);
  await exigirAcabadoDelProyecto(usuarioId, lugarId, proyecto.id);
  return { placeId: lugarId, placeInherited: false, placeSpot: sitio, placeShot: plano };
}

/**
 * Lo que la escena no puede ser con el plano del lugar solo: sin lugar, con producto o con dos personajes. Se mira
 * con la escena **tal como va a quedar**, así que vale igual para cambiar el plano que para cambiar lo demás.
 */
export function exigirPlanoSoloCoherente(
  final: Pick<FilaEscena, "placeShot" | "placeId" | "placeInherited" | "productId" | "castFormat">,
  lugarDelProyecto: string | null,
): void {
  if (final.placeShot !== "solo_lugar") return;
  const lugar = final.placeId ?? (final.placeInherited ? lugarDelProyecto : null);
  if (!lugar)
    throw new ErrorLugar(409, "El plano del lugar solo necesita un lugar: elige uno o hereda el del proyecto.");
  if (final.productId) {
    throw new ErrorLugar(409, "El plano del lugar solo va sin nadie y sin producto: quita el producto de la escena.");
  }
  if (final.castFormat !== "solo") {
    throw new ErrorLugar(409, "El plano del lugar solo va sin nadie: vuelve el reparto a «solo» antes de elegirlo.");
  }
}

/**
 * **Podcast**: los clips de una misma conversación comparten lugar y versión, sí o sí. Al cambiar el lugar de una
 * escena del grupo se aplica a las demás en la misma transacción; el «dónde» también, porque es el mismo set.
 */
export async function aplicarLugarAlGrupo(
  tx: Ejecutor,
  escena: Pick<FilaEscena, "id" | "podcastGroupId" | "projectId">,
  campos: CamposEscena,
): Promise<void> {
  if (!escena.podcastGroupId || campos.placeId === undefined) return;
  await tx
    .update(scenes)
    .set({
      placeId: campos.placeId,
      placeInherited: campos.placeInherited ?? false,
      placeSpot: campos.placeSpot ?? "",
      updatedAt: new Date(),
    })
    .where(and(eq(scenes.podcastGroupId, escena.podcastGroupId), eq(scenes.projectId, escena.projectId)));
}

/** El lugar por defecto de un proyecto, ya comprobado. `null` lo quita. */
export async function lugarPorDefectoValido(
  usuarioId: string,
  valor: unknown,
  acabado: { acabado: "realista" | "animado"; estilo: string },
): Promise<string | null> {
  if (valor === null || valor === "" || valor === undefined) return null;
  if (typeof valor !== "string" || !UUID.test(valor)) throw new ErrorLugar(400, "Ese lugar no es válido.");
  await exigirLugarPropio(usuarioId, valor);
  const lugar = await lugarParaGenerar(usuarioId, { lugarId: valor, sitio: "", soloLugar: false });
  if (!lugar) throw new ErrorLugar(404, "Ese lugar no existe.");
  const motivo = acabadoDistinto(lugar, { ...acabado, de: "el proyecto" });
  if (motivo) throw new ErrorLugar(409, `${motivo} Elige un lugar con el mismo acabado.`);
  return valor;
}

/**
 * Cambiar el lugar por defecto cambia lo que generarían las escenas que lo heredan: las aprobadas vuelven a
 * borrador con el motivo escrito, y las ya generadas quedan marcadas como cambiadas. Va en la transacción del cambio.
 */
export async function invalidarHerederasDelProyecto(tx: Ejecutor, proyectoId: string): Promise<void> {
  const heredan = and(eq(scenes.projectId, proyectoId), eq(scenes.placeInherited, true));
  const invalidadas = await tx
    .update(scenes)
    .set({
      state: "borrador",
      approvedAt: null,
      invalidationReason: motivoDeInvalidacion("Has cambiado el lugar del proyecto"),
      updatedAt: new Date(),
    })
    .where(and(heredan, eq(scenes.state, "aprobada")))
    .returning({ id: scenes.id });
  await tx
    .update(scenes)
    .set({ changedSinceGeneration: true })
    .where(and(heredan, or(isNotNull(scenes.approvedFrameMediaId), isNotNull(scenes.clipMediaId))));
  if (invalidadas.length > 0) {
    await tx
      .update(projects)
      .set({ state: "borrador", planApprovedAt: null, planApprovedBy: null })
      .where(and(eq(projects.id, proyectoId), eq(projects.state, "planificado")));
  }
}

/**
 * **El plano del lugar solo** de una escena: sale de la maestra del lugar, sin nadie, y se anima después como
 * cualquier fotograma, mudo. `null` si la escena no es un plano solo. Sin lugar o sin maestra no hay nada que
 * generar, y se dice antes de cobrar.
 */
export async function planoDelLugarSolo(
  usuarioId: string,
  escena: FilaEscena,
  proyecto: FilaProyecto,
): Promise<{ medioId: string; prompt: string } | null> {
  if (escena.placeShot !== "solo_lugar") return null;
  const lugar = await lugarParaGenerar(usuarioId, lugarDeLaEscena(escena, proyecto.defaultPlaceId));
  if (!lugar) {
    throw new ErrorLugar(
      409,
      "Esta escena es un plano del lugar solo y ya no tiene lugar. Elige uno. No se ha cobrado nada.",
    );
  }
  if (!lugar.maestraId) {
    throw new ErrorLugar(
      409,
      `El plano de «${lugar.nombre}» parte de su foto maestra y no tiene ninguna. Márcala en la ficha del lugar. No se ha cobrado nada.`,
    );
  }
  const texto = (escena.action.trim() !== "" ? escena.action : escena.scriptText).trim();
  // Lo que se describe es el plano en castellano; el servidor lo traduce como el resto del texto de la escena.
  return {
    medioId: lugar.maestraId,
    prompt: texto.length >= 12 ? texto : "Plano general del lugar, vacío y sin nadie.",
  };
}
