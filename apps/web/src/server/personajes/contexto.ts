import { and, eq, inArray, isNull } from "drizzle-orm";
import { bloqueDeEstiloAnimado, GUIA_ESTILO_VACIA } from "@/lib/animados";
import { esVista } from "@/lib/captura-personaje";
import { CAPACIDAD_DE_TIPO } from "@/lib/catalogo";
import { componerContexto, componerPrompt, mejoresReferencias, type ReferenciaElegible } from "@/lib/ficha-personaje";
import type { ContextoAplicado } from "@/lib/personajes";
import { db } from "../db/cliente";
import {
  characterReferences,
  characters,
  characterVersions,
  type FilaPersonaje,
  type FilaVersionPersonaje,
  media,
} from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { resolver } from "../proveedores/registro";
import { filaPropia } from "./consulta";
import { fichaDeFila, instantaneaDeVersion, ultimaVersion } from "./ficha";
import { asegurarVersionVigente } from "./versiones";

/**
 * La ficha es **contexto de generación**, no solo archivo (petición del propietario, 2026-09-27).
 *
 * De una versión de la ficha sale un bloque de texto que se añade al prompt del fotograma y de la animación,
 * junto con las mejores referencias elegidas por cobertura de vistas. Reglas duras:
 *
 * - **lo compone el servidor**, siempre, a partir de la versión citada. El navegador no manda texto por aquí:
 *   lo que hace es **ver** el resultado antes de confirmar (`contextoAplicado`), con la misma función;
 * - el texto de la ficha va **limpio** (`lib/ficha-personaje.ts`): sin saltos de línea, sin caracteres de
 *   estructura y sin parámetros ni instrucciones que intenten cambiar lo que se le pide al proveedor;
 * - el prompt que se guarda en el trabajo es **el compuesto**, el mismo que se envía. Así un trabajo hecho con
 *   la versión 2 sigue llevando el contexto de la 2 aunque la ficha cambie después.
 */

/**
 * Bloque de contexto de una versión concreta, **con su descripción**. Cadena vacía si la versión no dice nada.
 *
 * Se compone a partir de la instantánea guardada en la versión, no de la fila del personaje: es lo que hace que
 * un trabajo siga llevando el contexto de la versión que citó aunque la ficha cambie después.
 */
export const contextoDeVersion = (version: FilaVersionPersonaje, tipo: FilaPersonaje["kind"]): string => {
  const instantanea = instantaneaDeVersion(version);
  const ficha = componerContexto(
    instantanea.ficha,
    tipo,
    instantanea.descripcion,
    instantanea.renderStyle === "animado",
  );
  if (instantanea.renderStyle !== "animado") return ficha;
  return [ficha, bloqueDeEstiloAnimado(instantanea.styleGuide ?? GUIA_ESTILO_VACIA)].filter(Boolean).join("\n");
};

/** Referencias utilizables del personaje con lo que necesita la elección por cobertura. */
export async function referenciasElegibles(personajeId: string): Promise<ReferenciaElegible[]> {
  const filas = await db()
    .select({
      mediaId: characterReferences.mediaId,
      vistaClave: characterReferences.viewKey,
      origen: characterReferences.origin,
      orden: characterReferences.sortOrder,
    })
    .from(characterReferences)
    .innerJoin(media, eq(media.id, characterReferences.mediaId))
    .where(and(eq(characterReferences.characterId, personajeId), isNull(media.deletedAt)))
    .orderBy(characterReferences.sortOrder, characterReferences.createdAt);
  return filas.map((f) => ({
    mediaId: f.mediaId,
    vistaClave: esVista(f.vistaClave) ? f.vistaClave : null,
    origen: f.origen,
  }));
}

/**
 * La **mejor imagen** del personaje: la primera que elegiría la cobertura de vistas, que en un personaje
 * inventado es su retrato y en uno real, su foto frontal. `null` si todavía no tiene ninguna utilizable.
 *
 * La usa «Completar la ficha con IA» (0.22.1) para enseñarle al modelo de texto a quién está describiendo.
 */
export async function mejorReferenciaDe(personajeId: string, tipo: FilaPersonaje["kind"]): Promise<string | null> {
  const personaje = await personajePorId(personajeId);
  if (personaje?.renderStyle === "animado" && personaje.masterFrameMediaId) {
    const [maestro] = await db()
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, personaje.masterFrameMediaId), isNull(media.deletedAt)))
      .limit(1);
    if (maestro) return maestro.id;
  }
  return mejoresReferencias(tipo, await referenciasElegibles(personajeId), 1)[0] ?? null;
}

/** El retrato maestro va delante de las demás vistas, también cuando el modelo solo admite una imagen. */
function referenciasConMaestro(
  personaje: FilaPersonaje,
  version: FilaVersionPersonaje | null,
  elegibles: ReferenciaElegible[],
  maximo: number,
): string[] {
  const deVersion = version ? deLaVersion(version, elegibles) : elegibles;
  const maestro = personaje.renderStyle === "animado" ? personaje.masterFrameMediaId : null;
  if (!maestro || !deVersion.some((r) => r.mediaId === maestro)) {
    return mejoresReferencias(personaje.kind, deVersion, maximo);
  }
  return [
    maestro,
    ...mejoresReferencias(
      personaje.kind,
      deVersion.filter((r) => r.mediaId !== maestro),
      maximo - 1,
    ),
  ];
}

/**
 * Contexto de generación de un personaje: la versión vigente, su bloque de texto y las referencias que se
 * enviarán, ya elegidas por cobertura y recortadas al tope del modelo.
 *
 * Es lo que usa `/crear` al encolar **y** lo que se le muestra al usuario antes de confirmar: la misma
 * función, así que no puede decir una cosa y enviarse otra.
 */
export async function contextoParaGenerar(
  personaje: FilaPersonaje,
  maximoDelModelo: number,
): Promise<{ version: FilaVersionPersonaje; contexto: string; referencias: string[] }> {
  const version = await asegurarVersionVigente(personaje);
  const elegibles = await referenciasElegibles(personaje.id);
  return {
    version,
    contexto: contextoDeVersion(version, personaje.kind),
    referencias: referenciasConMaestro(personaje, version, elegibles, maximoDelModelo),
  };
}

/**
 * Referencias de la **instantánea de la versión**, cruzadas con las que siguen siendo utilizables. Las dos
 * mitades importan: la instantánea es lo que se citó (así el contexto y las fotos hablan de la misma versión) y
 * el cruce es lo que evita enviar una foto que ya está en la papelera o que se quitó del personaje.
 *
 * Si el cruce se queda vacío —una versión antigua cuyas fotos ya no existen—, se usa lo que hay ahora: mejor
 * enviar las fotos vigentes que no enviar ninguna y fallar al generar.
 */
function deLaVersion(version: FilaVersionPersonaje, elegibles: ReferenciaElegible[]): ReferenciaElegible[] {
  const citadas = new Set(version.referenceMediaIds);
  const cruce = elegibles.filter((r) => citadas.has(r.mediaId));
  return cruce.length > 0 ? cruce : elegibles;
}

/** Prompt final con el contexto de la versión citada; el mismo que se guarda y el mismo que se envía. */
export const promptConContexto = (escena: string, contexto: string): string => componerPrompt(escena, contexto);

/**
 * Contexto tal como se lo enseñamos al usuario antes de confirmar (zona de claridad de «Crear»). Es una
 * **lectura**: no encola nada, no reserva presupuesto, no toca al proveedor y **no escribe en la base de
 * datos** —ni siquiera una versión: la 1 la crean el alta del personaje y el relleno de la migración—. Un
 * personaje ajeno responde 404.
 *
 * Un personaje sin ninguna versión (algo que ya no debería pasar) se responde con la ficha vigente y
 * `versionId` vacío: se ve el contexto y la confirmación no compara versiones.
 */
export async function contextoAplicado(actor: Actor, id: unknown, modeloPedido?: unknown): Promise<ContextoAplicado> {
  const personaje = await filaPropia(actor, id);
  const modelo = typeof modeloPedido === "string" && modeloPedido !== "" ? modeloPedido : null;
  const { modelo: elegido } = await resolver(CAPACIDAD_DE_TIPO.fotograma, modelo);
  const maximo = elegido.parametros.maximoReferencias;
  const elegibles = await referenciasElegibles(personaje.id);
  const version = await ultimaVersion(personaje.id);
  const ids = referenciasConMaestro(personaje, version, elegibles, maximo);
  const porId = new Map(elegibles.map((r) => [r.mediaId, r]));
  const filas = ids.length === 0 ? [] : await db().select().from(media).where(inArray(media.id, ids));
  const medios = new Map(filas.map((f) => [f.id, aDto(f, actor)]));
  return {
    personajeId: personaje.id,
    nombre: personaje.name,
    versionId: version?.id ?? "",
    versionNumero: version?.number ?? 0,
    // Solo si la ficha aporta algo, nunca el texto: el prompt no sale hacia el navegador (ADR-0022).
    conContexto:
      (version
        ? contextoDeVersion(version, personaje.kind)
        : componerContexto(fichaDeFila(personaje), personaje.kind, personaje.description)) !== "",
    referencias: ids.map((medioId) => ({
      medioId,
      vista: porId.get(medioId)?.vistaClave ?? null,
      origen: porId.get(medioId)?.origen ?? "foto_original",
      medio: medios.get(medioId) ?? null,
    })),
    maximoDelModelo: maximo,
    modelo: elegido.modelo,
  };
}

/** Fila del personaje por identificador, sin comprobar dueño: quien llama ya lo ha hecho. */
export async function personajePorId(id: string): Promise<FilaPersonaje | null> {
  const [fila] = await db().select().from(characters).where(eq(characters.id, id)).limit(1);
  return fila ?? null;
}

/** Versión citada por un trabajo, para poder recomponer su contexto. `null` si el trabajo no cita ninguna. */
export async function versionDeTrabajo(versionId: string | null): Promise<FilaVersionPersonaje | null> {
  if (!versionId) return null;
  const [fila] = await db().select().from(characterVersions).where(eq(characterVersions.id, versionId)).limit(1);
  return fila ?? null;
}
