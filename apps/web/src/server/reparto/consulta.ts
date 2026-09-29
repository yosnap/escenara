import { asc, eq } from "drizzle-orm";
import type { ClipDePodcast, MiembroReparto, RepartoVista, TurnoReparto } from "@/lib/reparto";
import { db, type Ejecutor } from "../db/cliente";
import { characters, type FilaEscena, sceneCharacters, sceneDialogueTurns, scenes } from "../db/esquema";

/**
 * Lectura del reparto de una escena (0.28.0). **Solo lectura**: aquí no se valida nada y no se escribe nada, así
 * que la misma consulta vale para la pantalla, para la puerta de consentimiento y para el transporte.
 *
 * Todo lo que necesita saber quien compone el prompt sale de aquí: quién sale, con qué nombre —el nombre con el
 * que se registró, que es con el que hay que nombrarlo en el prompt para que el proveedor ate cada cara a su
 * lado—, por qué lado, adónde mira y qué dice en cada turno.
 */

/** Un personaje del reparto con lo que hace falta saber de él para gatear y para componer. */
export interface PersonajeDelReparto extends MiembroReparto {
  /** Voz del personaje (0.25.0): la predefinida elegida y sus ejes. Es lo que compara el aviso de misma voz. */
  firmaDeVoz: string;
}

/**
 * Firma de la voz de un personaje: la voz predefinida elegida más sus ejes, en orden estable.
 *
 * Dos personajes con la **misma** firma suenan igual, y una conversación en la que los dos suenan igual no se
 * entiende. No bloquea: se avisa antes de generar y el usuario decide. Un personaje que todavía no ha elegido
 * voz tiene firma vacía, y dos firmas vacías **no** son «la misma voz»: son dos personajes sin voz elegida.
 */
export function firmaDeVozDePersonaje(fila: { voicePresetId: string; voiceAxes: Record<string, string> }): string {
  const ejes = Object.entries(fila.voiceAxes)
    .filter(([, valor]) => valor !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, valor]) => `${clave}=${valor}`);
  if (fila.voicePresetId === "" && ejes.length === 0) return "";
  return [`voz=${fila.voicePresetId}`, ...ejes].join("|");
}

/**
 * Fila de una escena por su identificador, **sin comprobar de quién es**: es para los caminos que ya la han
 * comprobado propia antes (la puerta del clip, que hereda la escena del fotograma). Quien no la haya comprobado
 * usa `asistente/consulta.ts › escenaPropia`, que responde 404 con una ajena.
 */
export async function escenaParaReparto(escenaId: string, ejecutor: Ejecutor = db()): Promise<FilaEscena | null> {
  const [fila] = await ejecutor.select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
  return fila ?? null;
}

/** Miembros del reparto de una escena, en su orden. Vacío en una escena sin reparto. */
export async function miembrosDelReparto(escenaId: string, ejecutor: Ejecutor = db()): Promise<PersonajeDelReparto[]> {
  const filas = await ejecutor
    .select({
      id: sceneCharacters.id,
      personajeId: sceneCharacters.characterId,
      papel: sceneCharacters.role,
      lado: sceneCharacters.side,
      mirada: sceneCharacters.gazeDirection,
      orden: sceneCharacters.sortOrder,
      nombre: characters.name,
      inventado: characters.virtual,
      vozPreset: characters.voicePresetId,
      ejesVoz: characters.voiceAxes,
    })
    .from(sceneCharacters)
    .innerJoin(characters, eq(characters.id, sceneCharacters.characterId))
    .where(eq(sceneCharacters.sceneId, escenaId))
    .orderBy(asc(sceneCharacters.sortOrder));
  return filas.map((f) => ({
    id: f.id,
    personajeId: f.personajeId,
    nombre: f.nombre,
    inventado: f.inventado,
    papel: f.papel,
    lado: f.lado,
    mirada: f.mirada,
    orden: f.orden,
    firmaDeVoz: firmaDeVozDePersonaje({ voicePresetId: f.vozPreset, voiceAxes: f.ejesVoz }),
  }));
}

/** Turnos de diálogo de una escena, en su orden. El texto sale **literal**, sin traducir. */
export async function turnosDelReparto(escenaId: string, ejecutor: Ejecutor = db()): Promise<TurnoReparto[]> {
  const filas = await ejecutor
    .select({
      id: sceneDialogueTurns.id,
      orden: sceneDialogueTurns.sortOrder,
      personajeId: sceneDialogueTurns.characterId,
      texto: sceneDialogueTurns.text,
      direccion: sceneDialogueTurns.direction,
      nombre: characters.name,
    })
    .from(sceneDialogueTurns)
    .innerJoin(characters, eq(characters.id, sceneDialogueTurns.characterId))
    .where(eq(sceneDialogueTurns.sceneId, escenaId))
    .orderBy(asc(sceneDialogueTurns.sortOrder));
  return filas;
}

/**
 * `true` cuando **dos personajes del reparto comparten voz**. Con firma vacía no se compara: eso es no haber
 * elegido voz todavía, no haber elegido la misma.
 */
export const compartenVoz = (miembros: readonly PersonajeDelReparto[]): boolean => {
  const firmas = miembros.map((m) => m.firmaDeVoz).filter((f) => f !== "");
  return new Set(firmas).size < firmas.length;
};

/** El reparto completo de una escena, tal como viaja al navegador. */
export async function repartoDeEscena(escena: FilaEscena, ejecutor: Ejecutor = db()): Promise<RepartoVista> {
  const [miembros, turnos] = await Promise.all([
    miembrosDelReparto(escena.id, ejecutor),
    turnosDelReparto(escena.id, ejecutor),
  ]);
  return {
    escenaId: escena.id,
    formato: escena.castFormat,
    grupoPodcast: escena.podcastGroupId,
    miembros: miembros.map(({ firmaDeVoz: _, ...miembro }) => miembro),
    turnos,
    // En el camino Omni actual los dos registros citan el mismo audioId del proyecto. Aunque las fichas tengan
    // presets distintos, el clip saldrá con esa misma voz: se avisa con la voz que realmente se envía.
    mismaVoz: escena.castFormat !== "solo" && miembros.length === 2 ? true : compartenVoz(miembros),
  };
}

/**
 * **Los clips de un podcast**, en el orden del intercambio: un personaje por clip, con su lado, su mirada
 * cruzada y **solo sus turnos**.
 *
 * Es el contrato que consumen el transporte del proveedor (un `character_id` por clip, medido como la vía fiable
 * el 2026-09-29) y el montaje de 0.32.0, que alterna los planos siguiendo este orden. Un personaje sin ningún
 * turno **también sale**: en un podcast puede tocarle solo escuchar, y su clip sigue existiendo.
 */
export async function clipsDePodcast(escena: FilaEscena, ejecutor: Ejecutor = db()): Promise<ClipDePodcast[]> {
  const [miembros, turnos] = await Promise.all([
    miembrosDelReparto(escena.id, ejecutor),
    turnosDelReparto(escena.id, ejecutor),
  ]);
  return miembros.map((miembro) => ({
    personajeId: miembro.personajeId,
    nombre: miembro.nombre,
    lado: miembro.lado,
    mirada: miembro.mirada,
    orden: miembro.orden,
    turnos: turnos.filter((t) => t.personajeId === miembro.personajeId),
  }));
}

/**
 * Personajes reales del reparto (los que no son inventados), con su nombre. Es lo que gatea la puerta del
 * consentimiento: **cada persona real de la escena** necesita el suyo, no solo el protagonista del proyecto.
 */
export const personasRealesDelReparto = (miembros: readonly PersonajeDelReparto[]): PersonajeDelReparto[] =>
  miembros.filter((m) => !m.inventado);

/**
 * Escenas de un mismo grupo de podcast, en el orden del plan. Es con lo que el montaje (0.32.0) empareja los
 * clips de un intercambio repartido en varias escenas.
 */
export async function escenasDelGrupoDePodcast(grupoId: string, ejecutor: Ejecutor = db()): Promise<FilaEscena[]> {
  return ejecutor.select().from(scenes).where(eq(scenes.podcastGroupId, grupoId)).orderBy(asc(scenes.sortOrder));
}
