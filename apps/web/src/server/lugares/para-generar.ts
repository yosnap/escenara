import { and, eq, isNull } from "drizzle-orm";
import type { GuiaEstiloAnimado } from "@/lib/animados";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { type LugarElegido, SITIO_EN_LUGAR_MAXIMO } from "@/lib/lugares";
import type { HechosLugar } from "../controles/contrato";
import { db } from "../db/cliente";
import { characters, type FilaEscena, media, projects, scenes } from "../db/esquema";
import { placeDeclarations, places, placeVersions } from "../db/esquema-lugares";
import type { LugarEnPrompt } from "../direccion/lugar";
import { ErrorLugar } from "./errores";

/**
 * **El lugar, resuelto para generar**: de la escena (o de la elección de «Crear») a lo que necesitan el compositor
 * del prompt, el reparto de referencias y la puerta de controles.
 *
 * Lo que manda es la **versión vigente**: su maestra es la que viaja y su descripción es la que entra en el prompt,
 * y su número es el que queda en el trabajo. El dueño va en el mismo `where` que el identificador: el lugar llega
 * ya comprobado desde la escena o desde la confirmación, y esto es el segundo cierre, no el primero.
 */

/** El lugar de un trabajo, con todo lo que hace falta saber de él para generarlo. */
export interface LugarParaGenerar {
  id: string;
  nombre: string;
  version: number;
  /** La maestra de la versión vigente, si sigue en la biblioteca. `null` = el lugar solo irá descrito. */
  maestraId: string | null;
  /** Descripción en castellano, congelada en la versión. La traduce quien compone. */
  descripcionOriginal: string;
  /** Dónde, dentro del lugar, en castellano. */
  sitioOriginal: string;
  acabado: "realista" | "animado";
  guia: GuiaEstiloAnimado;
  declarado: boolean;
  /** La declaración vigente con la que se genera; queda en el trabajo como prueba aunque el lugar se borre. */
  declaracionId: string | null;
  /** Plano del lugar solo: sin nadie, mudo, y con la maestra como imagen de partida. */
  soloLugar: boolean;
}

/** Lo que se pide de un lugar: cuál, dónde dentro de él y si es el plano del lugar solo. */
export interface LugarPedido {
  lugarId: string | null;
  sitio: string;
  soloLugar: boolean;
}

export const SIN_LUGAR: LugarPedido = { lugarId: null, sitio: "", soloLugar: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee el lugar elegido del cuerpo de una petición («Crear»). `null` cuando no viene ninguno, que es lo normal. */
export function leerLugarElegido(valor: unknown): LugarElegido | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "object" || Array.isArray(valor))
    throw new ErrorLugar(400, "El lugar que has enviado no es válido.");
  const c = valor as Record<string, unknown>;
  const lugarId = c.lugarId ?? "";
  if (lugarId === "") return null;
  if (typeof lugarId !== "string" || !UUID.test(lugarId)) throw new ErrorLugar(400, "Ese lugar no es válido.");
  return { lugarId, sitio: limpiarTextoDePrompt(c.sitio ?? "", SITIO_EN_LUGAR_MAXIMO) };
}

/** El lugar efectivo de una escena: el suyo, o el del proyecto si lo hereda. */
export function lugarDeLaEscena(
  escena: Pick<FilaEscena, "placeId" | "placeInherited" | "placeSpot" | "placeShot">,
  lugarDelProyecto: string | null,
): LugarPedido {
  const lugarId = escena.placeId ?? (escena.placeInherited ? lugarDelProyecto : null);
  if (!lugarId) return SIN_LUGAR;
  return { lugarId, sitio: escena.placeSpot, soloLugar: escena.placeShot === "solo_lugar" };
}

/**
 * Qué lugar se guarda en el trabajo. **La escena manda**, como con el producto: lo que diga el navegador al
 * confirmar se ignora. En «Crear» llega con la confirmación y se comprueba que sea de quien lo pide.
 */
export async function lugarDelTrabajo(
  usuarioId: string,
  escenaId: string | null,
  elegido: LugarElegido | null | undefined,
): Promise<LugarPedido> {
  if (escenaId) {
    const [fila] = await db()
      .select({ escena: scenes, lugarDelProyecto: projects.defaultPlaceId })
      .from(scenes)
      .innerJoin(projects, eq(projects.id, scenes.projectId))
      .where(eq(scenes.id, escenaId))
      .limit(1);
    return fila ? lugarDeLaEscena(fila.escena, fila.lugarDelProyecto) : SIN_LUGAR;
  }
  if (!elegido) return SIN_LUGAR;
  await exigirLugarPropio(usuarioId, elegido.lugarId);
  return { lugarId: elegido.lugarId, sitio: elegido.sitio, soloLugar: false };
}

/** Comprueba que el lugar es de quien lo pide. Uno ajeno responde 404, sin decir que existe. */
export async function exigirLugarPropio(usuarioId: string, lugarId: string): Promise<void> {
  const [fila] = await db()
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.id, lugarId), eq(places.ownerId, usuarioId)))
    .limit(1);
  if (!fila) throw new ErrorLugar(404, "Ese lugar no existe.");
}

/**
 * Resuelve el lugar de un trabajo. `null` cuando no lleva ninguno. Un lugar que ya no existe (se borró después de
 * elegirlo) también devuelve `null`: la escena lo perdió con el borrado y se genera sin él.
 */
export async function lugarParaGenerar(usuarioId: string, pedido: LugarPedido): Promise<LugarParaGenerar | null> {
  if (!pedido.lugarId) return null;
  const [fila] = await db()
    .select()
    .from(places)
    .where(and(eq(places.id, pedido.lugarId), eq(places.ownerId, usuarioId)))
    .limit(1);
  if (!fila) return null;
  const [version] = await db()
    .select()
    .from(placeVersions)
    .where(and(eq(placeVersions.placeId, fila.id), eq(placeVersions.number, fila.currentVersion)))
    .limit(1);
  // La maestra es la de la versión, y solo si sigue en la biblioteca: una foto en la papelera no se envía.
  const maestraId = version?.masterMediaId ?? null;
  const [maestra] = maestraId
    ? await db()
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.id, maestraId), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
        .limit(1)
    : [];
  const [declaracion] = await db()
    .select({ id: placeDeclarations.id })
    .from(placeDeclarations)
    .where(and(eq(placeDeclarations.placeId, fila.id), isNull(placeDeclarations.revokedAt)))
    .limit(1);
  return {
    id: fila.id,
    nombre: fila.name,
    version: fila.currentVersion,
    maestraId: maestra?.id ?? null,
    descripcionOriginal: (version?.snapshot.descripcion ?? fila.description).trim(),
    sitioOriginal: pedido.sitio.trim(),
    acabado: version?.snapshot.renderStyle ?? fila.renderStyle,
    guia: version?.snapshot.styleGuide ?? fila.styleGuide,
    declarado: declaracion !== undefined,
    declaracionId: declaracion?.id ?? null,
    soloLugar: pedido.soloLugar,
  };
}

/** Con qué acabado tiene que casar el lugar: el del proyecto (y su protagonista) o el del personaje de «Crear». */
export interface AcabadoEsperado {
  acabado: "realista" | "animado";
  /** Clave del estilo animado; vacía en realista o si no se sabe. */
  estilo: string;
  /** Qué es lo que marca el acabado, para el mensaje: «el proyecto», «Nora». */
  de: string;
}

/** El acabado que manda en una escena: el del proyecto, con el estilo de su protagonista. */
export async function acabadoDelProyecto(proyectoId: string): Promise<AcabadoEsperado | null> {
  const [fila] = await db()
    .select({ acabado: projects.renderStyle, guia: characters.styleGuide })
    .from(projects)
    .leftJoin(characters, eq(characters.id, projects.mainCharacterId))
    .where(eq(projects.id, proyectoId))
    .limit(1);
  if (!fila) return null;
  return {
    acabado: fila.acabado,
    estilo: fila.acabado === "animado" ? (fila.guia?.preset ?? "") : "",
    de: "el proyecto",
  };
}

/** El motivo por el que el acabado no casa, en castellano; vacío si casa. */
export function acabadoDistinto(lugar: LugarParaGenerar, esperado: AcabadoEsperado | null): string {
  if (!esperado) return "";
  if (lugar.acabado !== esperado.acabado) {
    return lugar.acabado === "animado"
      ? `«${lugar.nombre}» es un lugar animado y ${esperado.de} es realista: no se mezclan acabados.`
      : `«${lugar.nombre}» es un lugar real y ${esperado.de} es animado: no se mezclan acabados.`;
  }
  if (lugar.acabado === "animado" && esperado.estilo !== "" && lugar.guia.preset !== esperado.estilo) {
    return `«${lugar.nombre}» tiene otro estilo animado que ${esperado.de}: tienen que ser del mismo estilo.`;
  }
  return "";
}

/** Los hechos del lugar que evalúa el motor, con la misma cuenta de referencias que el envío. */
export function hechosDelLugar(
  lugar: LugarParaGenerar,
  esperado: AcabadoEsperado | null,
  lugarEnElReparto: number | null,
): HechosLugar {
  return {
    id: lugar.id,
    nombre: lugar.nombre,
    declarado: lugar.declarado,
    acabadoDistinto: acabadoDistinto(lugar, esperado),
    sinMaestra: lugar.maestraId === null,
    soloLugar: lugar.soloLugar,
    // Solo cuenta cuando hay maestra que enviar: sin ella ya lo dice `sinMaestra`.
    maestraNoCabe: lugar.maestraId !== null && !lugar.soloLugar && lugarEnElReparto !== null && lugarEnElReparto === 0,
  };
}

/** El lugar tal como entra en las 6C. `conReferencia` dice la verdad sobre lo que va a recibir el modelo. */
export const lugarEnPrompt = (
  lugar: LugarParaGenerar,
  enIngles: (texto: string) => string,
  conReferencia: boolean,
): LugarEnPrompt => ({
  descripcion: lugar.descripcionOriginal === "" ? "" : enIngles(lugar.descripcionOriginal),
  sitio: lugar.sitioOriginal === "" ? "" : enIngles(lugar.sitioOriginal),
  conReferencia,
  soloLugar: lugar.soloLugar,
});

/** Columnas del trabajo: qué lugar y qué versión se usaron. */
export const columnasDelLugar = (lugar: LugarParaGenerar | null) => ({
  placeId: lugar?.id ?? null,
  placeVersion: lugar?.version ?? null,
});
